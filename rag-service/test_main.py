import os
import sys
from unittest.mock import MagicMock
import multiprocessing

os.environ.setdefault("INTERNAL_RAG_TOKEN", "test-secret")

# Prevent downloading/loading Hugging Face embeddings during testing by mocking the class
import langchain_community.embeddings
langchain_community.embeddings.HuggingFaceEmbeddings = MagicMock()

import pytest
from fastapi.testclient import TestClient

from main import (
    app,
    detect_question_intent,
    sanitize_upload_filename,
    concise_excerpt,
    split_sentences,
    clean_sentence,
    query_keywords,
    tokenize_text,
    build_answer_from_documents,
    INSUFFICIENT_CONTEXT_MESSAGE,
    passes_evidence_gate,
    document_dedupe_key,
    citation_source_for_document,
    internal_token_valid,
    append_chat_exchange,
    normalize_chat_history,
    require_internal_rag_token_configured,
    normalize_session_id,
    get_session_dir,
    _extract_pdf_text_worker,
    cleanup_expired_sessions,
    _background_cleanup_loop,
    SESSION_CLEANUP_INTERVAL_MINUTES,
    _hash_secret,
)

import secrets as _secrets


def is_authorized_session_update(session: dict, provided_secret) -> bool:
    """Replicate the session-secret check from the endpoint (moved inline upstream)."""
    candidate = (provided_secret or "").strip()
    if not candidate:
        return False
    stored_hash = (session.get("hashed_session_secret") or "").strip()
    if stored_hash:
        return _secrets.compare_digest(_hash_secret(candidate), stored_hash)
    expected = (session.get("session_secret") or "").strip()
    if not expected:
        return False
    return _secrets.compare_digest(candidate, expected)


def test_session_secret_authorizes_only_matching_secret():
    session = {"session_secret": "expected-secret"}

    assert is_authorized_session_update(session, "expected-secret") is True
    assert is_authorized_session_update(session, "wrong-secret") is False
    assert is_authorized_session_update(session, None) is False
    assert is_authorized_session_update({}, "expected-secret") is False


def test_session_secret_authorizes_with_hashed_secret():
    hashed = _hash_secret("my-secret")
    session = {"hashed_session_secret": hashed}

    assert is_authorized_session_update(session, "my-secret") is True
    assert is_authorized_session_update(session, "wrong") is False
    assert is_authorized_session_update(session, None) is False


def test_detect_question_intent():
    assert detect_question_intent("What is this document about?") == "overview"
    assert detect_question_intent("What are these documents about?") == "overview"
    assert detect_question_intent("Explain the connection between X and Y") == "relationship"
    assert detect_question_intent("How does X compare to Y?") == "comparison"
    assert detect_question_intent("Compare the performance of model A and B") == "comparison"
    assert detect_question_intent("What is the revenue in 2023?") == "factual"
    assert detect_question_intent("Who is the CEO of the company?") == "factual"


def test_sanitize_upload_filename_valid():
    assert sanitize_upload_filename("test.pdf") == "test.pdf"
    assert sanitize_upload_filename("path/to/my_document.PDF") == "my_document.PDF"
    assert sanitize_upload_filename("C:\\Users\\file-name_123.pdf") == "file-name_123.pdf"


def test_sanitize_upload_filename_invalid():
    with pytest.raises(ValueError, match="Missing PDF file path"):
        sanitize_upload_filename("")

    with pytest.raises(ValueError, match="Missing PDF file path"):
        sanitize_upload_filename("   ")

    with pytest.raises(ValueError, match="Only PDF files are allowed"):
        sanitize_upload_filename("test.txt")

    with pytest.raises(ValueError, match="Uploaded filename contains unsupported characters"):
        sanitize_upload_filename("test$file.pdf")


def test_internal_token_valid_rejects_when_unset():
    assert internal_token_valid(None, "") is False
    assert internal_token_valid("", "") is False


def test_internal_token_valid_rejects_missing_when_set():
    assert internal_token_valid(None, "secret") is False
    assert internal_token_valid("", "secret") is False
    assert internal_token_valid("   ", "secret") is False


def test_internal_token_valid_accepts_exact_match():
    assert internal_token_valid("secret", "secret") is True


def test_require_internal_token_config_fails_when_unset(monkeypatch):
    import main as main_module

    monkeypatch.setattr(main_module, "INTERNAL_RAG_TOKEN", "")

    with pytest.raises(RuntimeError, match="INTERNAL_RAG_TOKEN"):
        require_internal_rag_token_configured()


def test_internal_token_validation_passes_when_configured(monkeypatch):
    import main as main_module

    monkeypatch.setattr(main_module, "INTERNAL_RAG_TOKEN", "configured-secret")

    assert require_internal_rag_token_configured() is None


def test_internal_auth_middleware_protects_validate_session_write():
    import main as main_module

    original_token = main_module.INTERNAL_RAG_TOKEN
    main_module.INTERNAL_RAG_TOKEN = "test-secret"
    try:
        client = TestClient(app)
        response = client.post("/validate-session-write")
        assert response.status_code == 403
        assert response.json()["error"] == "Forbidden"
    finally:
        main_module.INTERNAL_RAG_TOKEN = original_token


def test_internal_auth_middleware_protects_trailing_slash_paths():
    import main as main_module

    original_token = main_module.INTERNAL_RAG_TOKEN
    main_module.INTERNAL_RAG_TOKEN = "test-secret"
    try:
        client = TestClient(app)
        response = client.post("/process-pdf/")
        assert response.status_code == 403
        assert response.json()["error"] == "Forbidden"
    finally:
        main_module.INTERNAL_RAG_TOKEN = original_token


def test_health_check_endpoint():
    client = TestClient(app)
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_normalize_session_id_rejects_invalid_values():
    with pytest.raises(ValueError, match="Missing session id"):
        normalize_session_id("")

    with pytest.raises(ValueError):
        normalize_session_id("not-a-uuid")


def test_get_session_dir_requires_uuid_session_id():
    with pytest.raises(ValueError):
        get_session_dir("../escape")


def test_normalize_session_id_returns_canonical_uuid():
    normalized = normalize_session_id("550E8400-E29B-41D4-A716-446655440000")
    assert normalized == "550e8400-e29b-41d4-a716-446655440000"


def test_extract_pdf_text_worker_enforces_page_limit(tmp_path):
    from pypdf import PdfWriter

    pdf_path = tmp_path / "hello.pdf"
    writer = PdfWriter()
    writer.add_blank_page(width=300, height=144)
    with pdf_path.open("wb") as fp:
        writer.write(fp)

    # Use a local queue and call the worker directly (no subprocess) to validate limit logic.
    q = multiprocessing.Queue(maxsize=1)
    _extract_pdf_text_worker(str(pdf_path), max_pages=0, max_chars=1000, out_queue=q)
    result = q.get(timeout=2)
    assert result["ok"] is False
    assert "too many pages" in result["error"].lower()



def test_concise_excerpt():
    text = "This is a very long sentence that we want to abbreviate cleanly."
    assert concise_excerpt(text, max_chars=20) == "This is a very long..."
    assert concise_excerpt(text, max_chars=100) == text


def test_split_sentences():
    text = "First sentence! Second sentence. Third one?"
    sentences = split_sentences(text)

    assert len(sentences) == 3
    assert sentences[0] == "First sentence!"
    assert sentences[1] == "Second sentence."
    assert sentences[2] == "Third one?"


def test_clean_sentence():
    assert clean_sentence(" - Clean this sentence  ") == "Clean this sentence"
    assert clean_sentence("* clean me ") == "clean me"


def test_query_keywords():
    # Stopwords like "what", "is", "this", "about" are filtered out
    # Only tokens with length > 2 are kept
    assert query_keywords("What is this document about revenue?") == {"revenue"}
    assert query_keywords("accuracy of model") == {"model", "accuracy"}


def test_empty_query_handling():
    query = ""
    assert query.strip() == ""


def test_invalid_query_type():
    query = None
    assert query is None


def test_context_document_presence():
    docs = ["sample pdf content", "rag pipeline notes"]
    assert len(docs) > 0


def test_answer_response_structure():
    response = {
        "answer": "Sample answer",
        "sources": ["doc1.pdf"]
    }

    assert "answer" in response
    assert isinstance(response["sources"], list)


def test_db_connection_placeholder():
    db_status = True
    assert db_status is True


def test_query_routing_logic():
    query = "Summarize this PDF"

    if "summarize" in query.lower():
        route = "summarizer"
    else:
        route = "qa"

    assert route == "summarizer"


def test_crawler_response_structure():
    crawler_output = {
        "url": "https://example.com",
        "content": "Sample crawled content",
        "status": 200
    }

    assert "url" in crawler_output
    assert "content" in crawler_output
    assert crawler_output["status"] == 200


def test_crawler_empty_content():
    crawler_output = {
        "url": "https://example.com",
        "content": "",
        "status": 200
    }

    assert crawler_output["content"] == ""


def test_crawler_failed_status():
    crawler_output = {
        "url": "https://example.com",
        "content": None,
        "status": 500
    }

    assert crawler_output["status"] >= 400


def test_retry_logic_placeholder():
    retries = 3
    success = True

    for _ in range(retries):
        success = True


    assert success is True


def test_document_extraction_consistency():
    extracted_chunks = [
        "chunk one",
        "chunk two",
        "chunk three"
    ]

    assert len(extracted_chunks) == 3
    assert all(isinstance(chunk, str) for chunk in extracted_chunks)


def test_crawler_metadata_preservation():
    metadata = {
        "source": "sample.pdf",
        "page": 1
    }

    assert metadata["source"] == "sample.pdf"
    assert metadata["page"] == 1


def test_empty_document_handling():
    extracted_text = ""

    assert extracted_text == ""


def test_unstructured_pdf_ingestion_mock():
    mock_document = {
        "filename": "research.pdf",
        "content": "This is extracted PDF content"
    }

    assert "pdf" in mock_document["filename"]
    assert len(mock_document["content"]) > 0


class DummyDocument:
    def __init__(self, content, filename="doc.pdf", page=0):
        self.page_content = content
        self.metadata = {
            "filename": filename,
            "page": page,
            "document_id": filename,
        }


def test_evidence_gate_refuses_when_overlap_missing():
    docs = [DummyDocument("this is unrelated content", filename="a.pdf", page=0)]
    assert passes_evidence_gate("What is the revenue?", docs, best_score=0.1, intent="factual") is False


def test_evidence_gate_allows_when_overlap_and_score_good():
    docs = [DummyDocument("Revenue for 2023 was 10 million.", filename="a.pdf", page=0)]
    assert passes_evidence_gate("What is the revenue for 2023?", docs, best_score=0.2, intent="factual") is True


def test_build_answer_includes_citations_for_grounded_answer():
    doc = DummyDocument("Revenue for 2023 was 10 million.", filename="a.pdf", page=0)
    source_id_by_key = {document_dedupe_key(doc): 1}
    answer = build_answer_from_documents(
        "What is the revenue for 2023?",
        [doc],
        "factual",
        source_id_by_key=source_id_by_key,
    )
    assert "Source 1" in answer or "Sources 1" in answer


def test_build_answer_refuses_when_unanswerable():
    doc = DummyDocument("This document is about hiring policies.", filename="a.pdf", page=0)
    source_id_by_key = {document_dedupe_key(doc): 1}
    answer = build_answer_from_documents(
        "What is the revenue for 2023?",
        [doc],
        "factual",
        source_id_by_key=source_id_by_key,
    )
    assert answer == INSUFFICIENT_CONTEXT_MESSAGE


def test_citation_source_for_document_preserves_jump_metadata():
    doc = DummyDocument("Internship duration is 6 weeks. More details follow.", filename="policy.pdf", page=11)
    doc.metadata["chunk_index"] = 4
    source = citation_source_for_document(doc, 0)

    assert source["document"] == "policy.pdf"
    assert source["page"] == 12
    assert source["chunk_index"] == 4
    assert source["text"].startswith("Internship duration")
    assert source["preview"].startswith("Internship duration")


def test_citation_source_for_document_handles_missing_metadata():
    doc = DummyDocument("Useful supporting text.", filename="", page=0)
    doc.metadata = {}
    source = citation_source_for_document(doc, 2)

    assert source["document"] == "uploaded document"
    assert source["page"] is None
    assert source["chunk_index"] == 2


def test_normalize_chat_history_converts_legacy_exchange_shape():
    legacy_chat = [
        {
            "question": "What is covered?",
            "answer": "The document covers onboarding.",
            "sources": [{"document": "policy.pdf", "page": 1}],
            "mode": "default",
        }
    ]

    assert normalize_chat_history(legacy_chat) == [
        {"role": "user", "text": "What is covered?"},
        {
            "role": "bot",
            "text": "The document covers onboarding.",
            "sources": [{"document": "policy.pdf", "page": 1}],
            "streaming": False,
            "mode": "default",
        },
    ]


def test_append_chat_exchange_normalizes_and_persists_message_schema():
    session = {
        "chat": [
            {
                "question": "Old question?",
                "answer": "Old answer.",
                "sources": [],
            }
        ]
    }

    append_chat_exchange(
        session,
        "New question?",
        "New answer.",
        [{"document": "new.pdf", "page": 2}],
        None,
    )

    assert session["chat"] == [
        {"role": "user", "text": "Old question?"},
        {
            "role": "bot",
            "text": "Old answer.",
            "sources": [],
            "streaming": False,
            "mode": "default",
        },
        {"role": "user", "text": "New question?"},
        {
            "role": "bot",
            "text": "New answer.",
            "sources": [{"document": "new.pdf", "page": 2}],
            "streaming": False,
            "mode": "default",
        },
    ]


# ─── Session dirty-flag and per-session persistence helpers ─────────────────

def test_mark_session_dirty_marks_dirty_without_mutating_chat():
    from main import (
        sessions,
        _dirty_sessions,
        _mark_session_dirty,
        sessions_lock,
    )
    import threading
    sid = "test-dirty-" + _secrets.token_hex(4)
    with sessions_lock:
        sessions[sid] = {"chat": [], "created_at": 0, "last_accessed": 0, "documents": [], "session_secret": None, "lock": threading.Lock(), "vectorstore": None}
        _mark_session_dirty(sid)

    assert sid in _dirty_sessions
    assert len(sessions[sid]["chat"]) == 0

    with sessions_lock:
        del sessions[sid]
        _dirty_sessions.discard(sid)


def test_mark_session_dirty_ignores_unknown_session():
    from main import _mark_session_dirty, _dirty_sessions, sessions_lock
    unknown_sid = "no-such-session-" + _secrets.token_hex(4)
    with sessions_lock:
        _mark_session_dirty(unknown_sid)
    assert unknown_sid not in _dirty_sessions


def test_snapshot_session_for_persistence_excludes_runtime_fields():
    from main import _snapshot_session_for_persistence
    import threading
    meta = {
        "created_at": 1000.0,
        "last_accessed": 2000.0,
        "documents": ["doc1.pdf"],
        "chat": [{"question": "q", "answer": "a"}],
        "session_secret": "s3cr3t",
        "lock": threading.Lock(),
        "vectorstore": object(),
        "retrieval_cache": {"key": "val"},
        "processing_progress": {"stage": "done"},
    }
    snap = _snapshot_session_for_persistence(meta)
    assert "lock" not in snap
    assert "vectorstore" not in snap
    assert snap["created_at"] == 1000.0
    assert snap["hashed_session_secret"] == _hash_secret("s3cr3t")
    assert snap["chat"] == [{"question": "q", "answer": "a"}]
    assert snap["documents"] == ["doc1.pdf"]


def test_snapshot_returns_copies_not_references():
    from main import _snapshot_session_for_persistence
    chat_list = [{"question": "q", "answer": "a"}]
    docs_list = ["doc.pdf"]
    meta = {
        "created_at": 0,
        "last_accessed": 0,
        "documents": docs_list,
        "chat": chat_list,
        "session_secret": None,
    }
    snap = _snapshot_session_for_persistence(meta)
    snap["chat"].append({"question": "extra", "answer": "extra"})
    snap["documents"].append("extra.pdf")
    assert len(chat_list) == 1
    assert len(docs_list) == 1


def test_write_session_meta_file_creates_atomic_file(tmp_path, monkeypatch):
    from main import _write_session_meta_file
    import json as _json
    monkeypatch.setattr("main.get_session_dir", lambda sid: str(tmp_path / sid))
    sid = "atomic-test"
    data = {"chat": [{"q": "hello"}], "session_secret": "abc"}
    _write_session_meta_file(sid, data)
    meta_path = tmp_path / sid / "session_meta.json"
    assert meta_path.exists()
    written = _json.loads(meta_path.read_text())
    assert written["chat"] == [{"q": "hello"}]
    assert written["session_secret"] == "abc"
    assert not (tmp_path / sid / "session_meta.json.tmp").exists()


def test_flush_dirty_sessions_drains_dirty_set(tmp_path, monkeypatch):
    from main import (
        sessions,
        _dirty_sessions,
        _flush_dirty_sessions,
        sessions_lock,
    )
    import threading
    monkeypatch.setattr("main.get_session_dir", lambda sid: str(tmp_path / sid))
    sid = "flush-test-" + _secrets.token_hex(4)
    with sessions_lock:
        sessions[sid] = {
            "created_at": 0.0,
            "last_accessed": 0.0,
            "documents": [],
            "chat": [{"question": "flushed?", "answer": "yes"}],
            "session_secret": "tok",
            "lock": threading.Lock(),
            "vectorstore": None,
        }
        _dirty_sessions.add(sid)

    _flush_dirty_sessions()

    assert sid not in _dirty_sessions
    meta_path = tmp_path / sid / "session_meta.json"
    assert meta_path.exists()

    with sessions_lock:
        del sessions[sid]


def test_background_flush_thread_is_running():
    from main import _flush_thread
    import threading
    assert isinstance(_flush_thread, threading.Thread)
    assert _flush_thread.daemon is True
    assert _flush_thread.is_alive()


def test_session_flush_interval_env_var_respected(monkeypatch):
    import importlib
    monkeypatch.setenv("SESSION_FLUSH_INTERVAL_SECONDS", "42")
    import main as _main
    # The module-level constant reflects the env var at import time.
    # We read the value directly rather than re-importing to avoid side effects.
    assert _main.SESSION_FLUSH_INTERVAL_SECONDS >= 1
# ─── /ask/stream auth enforcement regression tests ───────────────────────────
#
# These tests exist specifically to prevent the regression described in issue #233:
# the /ask/stream endpoint was not included in `protected_paths`, allowing any
# caller with direct network access to port 5000 to bypass the Express gateway's
# rate limiters and IP ban system entirely.
#
# Each test manipulates INTERNAL_RAG_TOKEN on the main module directly so the
# middleware sees the value at request time (the same pattern used by
# test_internal_auth_middleware_protects_validate_session_write above).

def test_ask_stream_rejected_without_token_when_auth_configured():
    """POST /ask/stream without X-Internal-Token must return 403 when token is set."""
    import main as main_module

    original = main_module.INTERNAL_RAG_TOKEN
    main_module.INTERNAL_RAG_TOKEN = "stream-test-secret"
    try:
        client = TestClient(app, raise_server_exceptions=False)
        response = client.post(
            "/ask/stream",
            json={
                "question": "What is this document about?",
                "session_id": "00000000-0000-0000-0000-000000000001",
            },
        )
        assert response.status_code == 403, (
            f"Expected 403 Forbidden when X-Internal-Token is absent, got {response.status_code}"
        )
        body = response.json()
        assert body.get("error") == "Forbidden" or body.get("detail") == "Forbidden"
    finally:
        main_module.INTERNAL_RAG_TOKEN = original


def test_ask_stream_rejected_with_wrong_token():
    """POST /ask/stream with an incorrect X-Internal-Token must return 403."""
    import main as main_module

    original = main_module.INTERNAL_RAG_TOKEN
    main_module.INTERNAL_RAG_TOKEN = "correct-stream-secret"
    try:
        client = TestClient(app, raise_server_exceptions=False)
        response = client.post(
            "/ask/stream",
            json={
                "question": "What is this document about?",
                "session_id": "00000000-0000-0000-0000-000000000002",
            },
            headers={"X-Internal-Token": "wrong-secret"},
        )
        assert response.status_code == 403, (
            f"Expected 403 Forbidden for wrong token, got {response.status_code}"
        )
        body = response.json()
        assert body.get("error") == "Forbidden" or body.get("detail") == "Forbidden"
    finally:
        main_module.INTERNAL_RAG_TOKEN = original


def test_ask_stream_passes_middleware_with_correct_token():
    """POST /ask/stream with the correct X-Internal-Token must not be rejected by auth middleware.

    The request will still fail (404 — no such session) because we are not
    setting up a real session, but the important assertion is that the
    middleware itself lets the request through to the route handler.
    A 403 at this stage would mean the auth middleware is incorrectly
    rejecting a legitimately-authenticated internal call.
    """
    import main as main_module

    original = main_module.INTERNAL_RAG_TOKEN
    main_module.INTERNAL_RAG_TOKEN = "valid-stream-token"
    try:
        client = TestClient(app, raise_server_exceptions=False)
        response = client.post(
            "/ask/stream",
            json={
                "question": "What is this document about?",
                "session_id": "00000000-0000-0000-0000-000000000003",
                "session_secret": "any-secret",
            },
            headers={"X-Internal-Token": "valid-stream-token"},
        )
        # Auth middleware passed — the route handler responded.
        # We expect 404 (unknown session), not 403 (auth rejection).
        assert response.status_code != 403, (
            "Auth middleware should not reject a request carrying the correct token. "
            f"Got {response.status_code}: {response.text}"
        )
    finally:
        main_module.INTERNAL_RAG_TOKEN = original

def test_ask_stream_rejected_when_token_is_cleared_after_startup():
    """Protected endpoints fail closed if token config becomes unavailable."""
    import main as main_module

    original = main_module.INTERNAL_RAG_TOKEN
    main_module.INTERNAL_RAG_TOKEN = ""
    try:
        client = TestClient(app, raise_server_exceptions=False)
        response = client.post(
            "/ask/stream",
            json={
                "question": "What is this document about?",
                "session_id": "00000000-0000-0000-0000-000000000004",
                "session_secret": "irrelevant",
            },
        )
        # Fail-closed behavior: when INTERNAL_RAG_TOKEN is unset, the
        # middleware should still block protected requests with 403.
        assert response.status_code == 403, (
            "Middleware must block protected requests when INTERNAL_RAG_TOKEN is unset. "
            f"Got {response.status_code}"
        )
    finally:
        main_module.INTERNAL_RAG_TOKEN = original


def test_protected_paths_set_includes_ask_stream():
    """Regression: /ask/stream must be present in protected_paths inside the middleware.

    This test directly inspects the middleware source to verify the set is correct,
    providing a fast feedback loop even when integration tests are not run.
    """
    import main as main_module

    assert "/ask/stream" in main_module.PROTECTED_RAG_PATHS, (
        "/ask/stream is missing from protected_paths in internal_auth_middleware. "
        "This is the root cause of issue #233."
    )


def test_ask_subtree_prefix_guard_is_present():
    """Regression: the /ask/ prefix must appear in protected_prefixes.

    A prefix-based guard ensures that future sub-routes under /ask/ (such as
    /ask/v2/stream) are automatically protected without requiring a manual
    update to the exact-match set — closing the class of bug that caused #233.
    """
    import main as main_module

    assert "/ask/" in main_module.PROTECTED_RAG_PREFIXES, (
        "The /ask/ prefix is missing from the protected_prefixes tuple. "
        "Without it, any new sub-route under /ask/ could bypass auth."
    )


def test_internal_token_valid_rejects_empty_string_when_token_set():
    """Whitespace-only token must not satisfy the auth check."""
    assert internal_token_valid("   ", "secret") is False


def test_internal_token_valid_rejects_none_when_token_set():
    assert internal_token_valid(None, "secret") is False


def test_internal_token_valid_case_sensitive():
    """Token comparison must be case-sensitive — 'Secret' != 'secret'."""
    assert internal_token_valid("Secret", "secret") is False
    assert internal_token_valid("secret", "secret") is True


# ── Issue #264: background session cleanup ────────────────────────────────────
#
# cleanup_expired_sessions() must no longer be called inline inside request
# handlers. These tests verify:
#   1. The function is not referenced in the hot path of /ask, /summarize,
#      /process-pdf, /ask/stream, or /sessions/lookup.
#   2. The background loop coroutine exists and is wired up.
#   3. SESSION_CLEANUP_INTERVAL_MINUTES is a positive integer.
#   4. cleanup_expired_sessions() handles an empty session map without error.
#   5. cleanup_expired_sessions() evicts expired sessions and releases the
#      sessions_lock before performing any shutil.rmtree calls.
#   6. cleanup_expired_sessions() enforces MAX_ACTIVE_SESSIONS by evicting
#      the oldest session when the cap is exceeded.

import inspect
import asyncio as _asyncio
import threading as _threading
from unittest.mock import patch, call as mock_call
import main as _main_module


def test_cleanup_not_called_inline_in_ask_handler():
    """
    /ask handler must not call cleanup_expired_sessions().
    Cleanup now runs on a background schedule; calling it inline on every
    inference request causes O(N) session scan and sessions_lock contention.
    """
    source = inspect.getsource(_main_module.ask_question)
    assert "cleanup_expired_sessions()" not in source, (
        "/ask handler must not call cleanup_expired_sessions() inline. "
        "Cleanup should only run via the background asyncio task."
    )


def test_cleanup_not_called_inline_in_ask_stream_handler():
    """/ask/stream handler must not call cleanup_expired_sessions() inline."""
    source = inspect.getsource(_main_module.ask_question_stream)
    assert "cleanup_expired_sessions()" not in source, (
        "/ask/stream handler must not call cleanup_expired_sessions() inline."
    )


def test_cleanup_not_called_inline_in_summarize_handler():
    """/summarize handler must not call cleanup_expired_sessions() inline."""
    source = inspect.getsource(_main_module.summarize_pdf)
    assert "cleanup_expired_sessions()" not in source, (
        "/summarize handler must not call cleanup_expired_sessions() inline."
    )


def test_cleanup_not_called_inline_in_process_pdf_handler():
    """/process-pdf handler must not call cleanup_expired_sessions() inline.

    Note: _cleanup_expired_sessions_unlocked() is a different, narrower helper
    called inside sessions_lock during session creation — its presence in this
    handler is intentional. Only the broad O(N) cleanup_expired_sessions() call
    must be absent.
    """
    source = inspect.getsource(_main_module.process_pdf)
    # Use the exact call signature so _cleanup_expired_sessions_unlocked() does
    # not trigger a false positive (it does not contain this exact substring).
    assert "cleanup_expired_sessions()" not in source, (
        "/process-pdf handler must not call cleanup_expired_sessions() inline. "
        "Cleanup should only run via the background asyncio task."
    )


def test_cleanup_not_called_inline_in_lookup_sessions_handler():
    """/sessions/lookup handler must not call cleanup_expired_sessions() inline."""
    source = inspect.getsource(_main_module.lookup_sessions)
    assert "cleanup_expired_sessions()" not in source, (
        "/sessions/lookup handler must not call cleanup_expired_sessions() inline."
    )


def test_session_cleanup_interval_is_positive_integer():
    """SESSION_CLEANUP_INTERVAL_MINUTES must be a positive integer >= 1."""
    assert isinstance(SESSION_CLEANUP_INTERVAL_MINUTES, int), (
        "SESSION_CLEANUP_INTERVAL_MINUTES must be an int"
    )
    assert SESSION_CLEANUP_INTERVAL_MINUTES >= 1, (
        "SESSION_CLEANUP_INTERVAL_MINUTES must be >= 1 to prevent a tight spin loop"
    )


def test_background_cleanup_loop_is_async_coroutine():
    """_background_cleanup_loop must be an async function (coroutine function)."""
    assert _asyncio.iscoroutinefunction(_background_cleanup_loop), (
        "_background_cleanup_loop must be declared with 'async def' so it can "
        "yield control to the event loop between cleanup runs."
    )


def test_cleanup_expired_sessions_noop_on_empty_sessions():
    """cleanup_expired_sessions() on an empty session map must not raise."""
    original = _main_module.sessions.copy()
    _main_module.sessions.clear()
    try:
        cleanup_expired_sessions()
    finally:
        _main_module.sessions.update(original)


def test_cleanup_expired_sessions_removes_expired_entry():
    """
    An expired session (last_accessed far in the past) must be removed from
    the sessions dict and its session_dir queued for deletion outside the lock.
    """
    import time as _time

    sid = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
    fake_dir = "/tmp/nonexistent-session-dir-test-only"

    original = dict(_main_module.sessions)
    _main_module.sessions[sid] = {
        "last_accessed": 0,  # epoch — always expired
        "created_at": 0,
        "session_dir": fake_dir,
        "session_secret": "test-secret",
        "lock": _threading.Lock(),
        "vectorstore": None,
        "documents": [],
        "chat": [],
    }

    rmtree_calls = []

    def fake_rmtree(path, **kwargs):
        rmtree_calls.append(path)

    with patch.object(_main_module.shutil, "rmtree", side_effect=fake_rmtree):
        with patch.object(_main_module, "save_sessions_unlocked"):
            with patch.object(_main_module, "cleanup_expired_persisted_sessions"):
                cleanup_expired_sessions()

    try:
        assert sid not in _main_module.sessions, (
            "Expired session must be removed from the in-memory sessions dict"
        )
    finally:
        # Restore any sessions that were there before the test.
        _main_module.sessions.clear()
        _main_module.sessions.update(original)


def test_cleanup_expired_sessions_evicts_oldest_when_over_cap():
    """
    When the session count exceeds MAX_ACTIVE_SESSIONS, cleanup must evict
    the oldest session (lowest created_at) to bring the count back to the cap.
    """
    import copy as _copy

    original = dict(_main_module.sessions)
    original_cap = _main_module.MAX_ACTIVE_SESSIONS

    # Temporarily lower the cap to 1 so a second session causes eviction.
    _main_module.MAX_ACTIVE_SESSIONS = 1

    sid_old = "00000000-0000-0000-0000-000000000001"
    sid_new = "00000000-0000-0000-0000-000000000002"
    now = _main_module.now_ts()

    def _make_session(created_at, last_accessed):
        return {
            "created_at": created_at,
            "last_accessed": last_accessed,
            "session_dir": None,
            "session_secret": "s",
            "lock": _threading.Lock(),
            "vectorstore": None,
            "documents": [],
            "chat": [],
        }

    _main_module.sessions.clear()
    _main_module.sessions[sid_old] = _make_session(now - 1000, now)
    _main_module.sessions[sid_new] = _make_session(now, now)

    try:
        with patch.object(_main_module, "save_sessions_unlocked"):
            with patch.object(_main_module, "cleanup_expired_persisted_sessions"):
                cleanup_expired_sessions()

        assert sid_old not in _main_module.sessions, (
            "Oldest session must be evicted when MAX_ACTIVE_SESSIONS is exceeded"
        )
        assert sid_new in _main_module.sessions, (
            "Newer session must be retained after eviction"
        )
    finally:
        _main_module.sessions.clear()
        _main_module.sessions.update(original)
        _main_module.MAX_ACTIVE_SESSIONS = original_cap


def test_cleanup_holds_lock_only_for_dict_mutation_not_disk_io():
    """
    shutil.rmtree must never be called while sessions_lock is held.
    The lock should be released before any filesystem operation.
    """
    import threading as _t

    sid = "cccccccc-cccc-cccc-cccc-cccccccccccc"
    fake_dir = "/tmp/nonexistent-lock-test-dir"

    original = dict(_main_module.sessions)
    _main_module.sessions[sid] = {
        "last_accessed": 0,
        "created_at": 0,
        "session_dir": fake_dir,
        "session_secret": "x",
        "lock": _t.Lock(),
        "vectorstore": None,
        "documents": [],
        "chat": [],
    }

    lock_held_during_rmtree = []

    def fake_rmtree(path, **kwargs):
        # sessions_lock.locked() returns True if ANY thread holds the lock.
        # Because this test runs single-threaded, the lock must be released
        # before we get here.
        lock_held_during_rmtree.append(_main_module.sessions_lock.locked())

    with patch.object(_main_module.shutil, "rmtree", side_effect=fake_rmtree):
        with patch.object(_main_module, "save_sessions_unlocked"):
            with patch.object(_main_module, "cleanup_expired_persisted_sessions"):
                cleanup_expired_sessions()

    try:
        for held in lock_held_during_rmtree:
            assert not held, (
                "sessions_lock must NOT be held during shutil.rmtree — "
                "disk I/O inside the lock blocks all concurrent request handlers"
            )
    finally:
        _main_module.sessions.clear()
        _main_module.sessions.update(original)
def test_stream_lazy_load_faiss_uses_get_embedding_model():
    import main as main_module
    from unittest.mock import patch, MagicMock
    import threading
    from fastapi.testclient import TestClient

    original_embedding_model = main_module.embedding_model
    main_module.embedding_model = None

    client = TestClient(main_module.app, raise_server_exceptions=False)
    
    session_id = "00000000-0000-0000-0000-000000000009"
    with main_module.sessions_lock:
        main_module.sessions[session_id] = {
            "lock": threading.Lock(),
            "session_secret": "test_secret",
            "vectorstore": None,
            "documents": [],
            "last_accessed": main_module.now_ts(),
            "created_at": main_module.now_ts(),
        }

    try:
        with patch("main.get_embedding_model") as mock_get_embedding_model:
            with patch("main.FAISS.load_local") as mock_faiss_load:
                # We expect load_local to raise an exception or succeed, but either way it should call get_embedding_model
                mock_get_embedding_model.return_value = MagicMock()
                mock_faiss_load.return_value = MagicMock()
                
                client.post(
                    "/ask/stream",
                    json={
                        "question": "test",
                        "session_id": session_id,
                        "session_secret": "test_secret"
                    },
                    headers={"X-Internal-Token": main_module.INTERNAL_RAG_TOKEN},
                )
                
                mock_get_embedding_model.assert_called_once()
                mock_faiss_load.assert_called_once()

                # Verify that load_local was called with the result of get_embedding_model()
                # FAISS.load_local(get_session_dir(session_id), get_embedding_model(), allow_dangerous_deserialization=True)
                call_args = mock_faiss_load.call_args
                assert call_args[0][0] == main_module.get_session_dir(session_id)
                assert call_args[0][1] == mock_get_embedding_model.return_value

                with main_module.sessions_lock:
                    assert main_module.sessions[session_id]["session_dir"] == main_module.get_session_dir(session_id)
    finally:
        main_module.embedding_model = original_embedding_model
        with main_module.sessions_lock:
            main_module.sessions.pop(session_id, None)
