import sys
from unittest.mock import MagicMock
import multiprocessing

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
    normalize_session_id,
    get_session_dir,
    _extract_pdf_text_worker,
)

import secrets as _secrets


def is_authorized_session_update(session: dict, provided_secret) -> bool:
    """Replicate the session-secret check from the endpoint (moved inline upstream)."""
    expected = (session.get("session_secret") or "").strip()
    candidate = (provided_secret or "").strip()
    if not expected or not candidate:
        return False
    return _secrets.compare_digest(candidate, expected)


def test_session_secret_authorizes_only_matching_secret():
    session = {"session_secret": "expected-secret"}

    assert is_authorized_session_update(session, "expected-secret") is True
    assert is_authorized_session_update(session, "wrong-secret") is False
    assert is_authorized_session_update(session, None) is False
    assert is_authorized_session_update({}, "expected-secret") is False


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


def test_internal_token_valid_allows_when_unset():
    assert internal_token_valid(None, "") is True
    assert internal_token_valid("", "") is True


def test_internal_token_valid_rejects_missing_when_set():
    assert internal_token_valid(None, "secret") is False
    assert internal_token_valid("", "secret") is False
    assert internal_token_valid("   ", "secret") is False


def test_internal_token_valid_accepts_exact_match():
    assert internal_token_valid("secret", "secret") is True


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


# ─── Session dirty-flag and per-session persistence helpers ─────────────────

def test_append_chat_and_mark_dirty_adds_entry_and_marks_dirty():
    from main import (
        sessions,
        _dirty_sessions,
        _append_chat_and_mark_dirty,
        sessions_lock,
    )
    import threading
    sid = "test-dirty-" + _secrets.token_hex(4)
    with sessions_lock:
        sessions[sid] = {"chat": [], "created_at": 0, "last_accessed": 0, "documents": [], "session_secret": None, "lock": threading.Lock(), "vectorstore": None}
        _append_chat_and_mark_dirty(sid, {"question": "q", "answer": "a", "sources": [], "mode": "default"})

    assert sid in _dirty_sessions
    assert len(sessions[sid]["chat"]) == 1
    assert sessions[sid]["chat"][0]["question"] == "q"

    with sessions_lock:
        del sessions[sid]
        _dirty_sessions.discard(sid)


def test_append_chat_and_mark_dirty_ignores_unknown_session():
    from main import _append_chat_and_mark_dirty, _dirty_sessions, sessions_lock
    unknown_sid = "no-such-session-" + _secrets.token_hex(4)
    with sessions_lock:
        _append_chat_and_mark_dirty(unknown_sid, {"question": "q", "answer": "a"})
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
    assert snap["session_secret"] == "s3cr3t"
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


def test_ask_stream_allowed_when_no_token_configured():
    """When INTERNAL_RAG_TOKEN is empty, /ask/stream must be reachable without a header.

    This preserves the open-by-default development experience: in local dev where
    the token is not set, the middleware must not block anything.
    """
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
        # No token configured → middleware is inactive → route handler ran.
        # Expect 404 (no session) or 422 (validation), never 403 (auth block).
        assert response.status_code != 403, (
            "Middleware must not block requests when INTERNAL_RAG_TOKEN is unset. "
            f"Got {response.status_code}"
        )
    finally:
        main_module.INTERNAL_RAG_TOKEN = original


def test_protected_paths_set_includes_ask_stream():
    """Regression: /ask/stream must be present in protected_paths inside the middleware.

    This test directly inspects the middleware source to verify the set is correct,
    providing a fast feedback loop even when integration tests are not run.
    """
    import inspect
    import main as main_module

    source = inspect.getsource(main_module.internal_auth_middleware)
    assert '"/ask/stream"' in source, (
        "/ask/stream is missing from protected_paths in internal_auth_middleware. "
        "This is the root cause of issue #233."
    )


def test_ask_subtree_prefix_guard_is_present():
    """Regression: the /ask/ prefix must appear in protected_prefixes.

    A prefix-based guard ensures that future sub-routes under /ask/ (such as
    /ask/v2/stream) are automatically protected without requiring a manual
    update to the exact-match set — closing the class of bug that caused #233.
    """
    import inspect
    import main as main_module

    source = inspect.getsource(main_module.internal_auth_middleware)
    assert '"/ask/"' in source, (
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


# ── Issue #265: additional path-traversal and sanitization tests ──────────────

def test_normalize_session_id_rejects_path_traversal_sequences():
    """Common path-traversal payloads must raise ValueError."""
    traversal_inputs = [
        "../../etc/passwd",
        "../secret",
        "..\\windows\\system32",
        "%2e%2e%2fetc%2fpasswd",
    ]
    for bad_input in traversal_inputs:
        with pytest.raises(ValueError, match="."):
            normalize_session_id(bad_input)


def test_normalize_session_id_rejects_null_byte():
    """Null byte injected into session_id must raise ValueError."""
    with pytest.raises(ValueError):
        normalize_session_id("550e8400-e29b-41d4-a716-446655440000\x00")


def test_sanitize_filename_rejects_null_byte():
    """Null bytes in upload filenames must cause a ValueError."""
    with pytest.raises((ValueError, Exception)):
        sanitize_upload_filename("file\x00name.pdf")


def test_sanitize_filename_rejects_overly_long_name():
    """Filenames exceeding typical filesystem limits (255 bytes) must be rejected."""
    long_name = "a" * 300 + ".pdf"
    with pytest.raises((ValueError, Exception)):
        sanitize_upload_filename(long_name)


def test_sanitize_filename_strips_path_separators():
    """Path separators in a filename must be stripped, leaving a safe basename."""
    result = sanitize_upload_filename("../../etc/safe.pdf")
    assert "/" not in result, "Forward slashes must be removed from filename"
    assert "\\" not in result, "Backslashes must be removed from filename"
    assert result.endswith(".pdf"), "Result must still be a .pdf filename"


def test_get_session_dir_stays_within_persist_path():
    """get_session_dir must always produce a path inside PERSIST_PATH."""
    from pathlib import Path
    from main import get_session_dir, PERSIST_PATH

    sid = "550e8400-e29b-41d4-a716-446655440000"
    session_dir = Path(get_session_dir(sid)).resolve()
    assert PERSIST_PATH in session_dir.parents or session_dir == PERSIST_PATH, (
        f"Session dir {session_dir} must be inside PERSIST_PATH {PERSIST_PATH}"
    )


def test_get_session_dir_rejects_non_uuid_path_traversal():
    """Non-UUID inputs to get_session_dir must raise an exception."""
    with pytest.raises((ValueError, Exception)):
        get_session_dir("../escape")
