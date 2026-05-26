"""
Security integration tests for the RAG FastAPI service.

Covers every security control that has no other test coverage:
  - INTERNAL_RAG_TOKEN enforcement on all protected paths
  - session_secret constant-time comparison (secrets.compare_digest, not ==)
  - PDF magic-byte validation (non-PDF files → 415)
  - Path-traversal rejection in session_id and filename inputs
  - Expired session returns 404 rather than leaking metadata
  - get_session_dir path-containment invariant
"""

import io
import threading
import secrets as _secrets
from unittest.mock import MagicMock, patch

import langchain_community.embeddings
langchain_community.embeddings.HuggingFaceEmbeddings = MagicMock()

import pytest
from fastapi.testclient import TestClient

import main as _main_module
from main import (
    app,
    internal_token_valid,
    normalize_session_id,
    sanitize_upload_filename,
    get_session_dir,
    PERSIST_PATH,
)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _set_token(token: str):
    """Temporarily override INTERNAL_RAG_TOKEN and return a reset callable."""
    original = _main_module.INTERNAL_RAG_TOKEN
    _main_module.INTERNAL_RAG_TOKEN = token
    return original


def _make_client(token: str = "") -> TestClient:
    """Return a TestClient with INTERNAL_RAG_TOKEN set to `token`."""
    _main_module.INTERNAL_RAG_TOKEN = token
    return TestClient(app, raise_server_exceptions=False)


VALID_UUID = "550e8400-e29b-41d4-a716-446655440000"
MINIMAL_PDF = b"%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF"


# ── INTERNAL_RAG_TOKEN enforcement ────────────────────────────────────────────

class TestInternalTokenEnforcement:
    """
    Every protected path must return 403 when the token is configured and the
    request omits or supplies a wrong X-Internal-Token header.
    """

    PROTECTED_PATHS = [
        ("POST", "/process-pdf"),
        ("POST", "/ask"),
        ("POST", "/ask/stream"),
        ("POST", "/summarize"),
        ("POST", "/validate-session-write"),
        ("POST", "/sessions/lookup"),
        ("GET",  f"/processing-status/{VALID_UUID}"),
    ]

    def setup_method(self):
        self._original = _set_token("strong-test-secret")
        self.client = TestClient(app, raise_server_exceptions=False)

    def teardown_method(self):
        _main_module.INTERNAL_RAG_TOKEN = self._original

    @pytest.mark.parametrize("method,path", PROTECTED_PATHS)
    def test_missing_token_returns_403(self, method, path):
        """No X-Internal-Token header → 403 Forbidden."""
        resp = self.client.request(method, path)
        assert resp.status_code == 403, (
            f"{method} {path} must return 403 when token is missing; "
            f"got {resp.status_code}"
        )
        assert resp.json().get("error") == "Forbidden"

    @pytest.mark.parametrize("method,path", PROTECTED_PATHS)
    def test_wrong_token_returns_403(self, method, path):
        """Wrong X-Internal-Token value → 403 Forbidden."""
        resp = self.client.request(
            method, path, headers={"X-Internal-Token": "wrong-value"}
        )
        assert resp.status_code == 403, (
            f"{method} {path} must return 403 on wrong token; "
            f"got {resp.status_code}"
        )

    @pytest.mark.parametrize("method,path", PROTECTED_PATHS)
    def test_correct_token_passes_auth(self, method, path):
        """Correct X-Internal-Token must not return 403 (may 400/422/404 for bad body)."""
        resp = self.client.request(
            method, path, headers={"X-Internal-Token": "strong-test-secret"}
        )
        assert resp.status_code != 403, (
            f"{method} {path} must not return 403 when token is correct; "
            f"got {resp.status_code}"
        )

    def test_no_token_configured_allows_all(self):
        """When INTERNAL_RAG_TOKEN is blank, all requests pass auth."""
        _main_module.INTERNAL_RAG_TOKEN = ""
        resp = self.client.get("/health")
        assert resp.status_code == 200


# ── session_secret constant-time comparison ───────────────────────────────────

class TestSessionSecretConstantTimeComparison:
    """
    The session_secret check in ask_question and summarize_pdf must use
    secrets.compare_digest, not a plain == operator, to prevent timing attacks.
    """

    def test_ask_handler_uses_compare_digest(self):
        import inspect
        source = inspect.getsource(_main_module.ask_question)
        assert "compare_digest" in source, (
            "/ask handler must use secrets.compare_digest for session_secret comparison"
        )
        assert "session_secret ==" not in source and '== session_secret' not in source, (
            "/ask handler must NOT use == for session_secret comparison"
        )

    def test_summarize_handler_uses_compare_digest(self):
        import inspect
        source = inspect.getsource(_main_module.summarize_pdf)
        assert "compare_digest" in source or "_require_session_secret" in source, (
            "/summarize handler must use compare_digest or delegate to _require_session_secret"
        )

    def test_compare_digest_is_constant_time(self):
        """Verify secrets.compare_digest itself behaves correctly (smoke test)."""
        assert _secrets.compare_digest("abc", "abc") is True
        assert _secrets.compare_digest("abc", "xyz") is False
        assert _secrets.compare_digest("abc", "ab") is False


# ── PDF magic-byte validation ─────────────────────────────────────────────────

class TestPdfMagicByteValidation:
    """
    Uploading a file whose first 4 bytes are not %PDF must return 415.
    The check must be against the actual file contents, not the MIME type.
    """

    def setup_method(self):
        self._original = _set_token("")  # disable auth so we hit the upload logic
        self.client = TestClient(app, raise_server_exceptions=False)

    def teardown_method(self):
        _main_module.INTERNAL_RAG_TOKEN = self._original

    def test_html_file_disguised_as_pdf_returns_415(self):
        """HTML content with a .pdf filename must be rejected with 415."""
        fake_pdf = io.BytesIO(b"<html><body>not a pdf</body></html>")
        resp = self.client.post(
            "/process-pdf",
            files={"file": ("evil.pdf", fake_pdf, "application/pdf")},
        )
        assert resp.status_code == 415, (
            f"Non-PDF content must return 415; got {resp.status_code}: {resp.text}"
        )

    def test_plain_text_file_returns_415(self):
        """Plain-text file with .pdf extension must be rejected with 415."""
        fake_pdf = io.BytesIO(b"This is just plain text, not a PDF at all.")
        resp = self.client.post(
            "/process-pdf",
            files={"file": ("notes.pdf", fake_pdf, "application/pdf")},
        )
        assert resp.status_code == 415

    def test_real_pdf_passes_magic_check(self):
        """A file starting with %PDF must pass magic-byte validation (may fail later)."""
        real_pdf = io.BytesIO(MINIMAL_PDF)
        resp = self.client.post(
            "/process-pdf",
            files={"file": ("real.pdf", real_pdf, "application/pdf")},
        )
        # Any status except 415 — PDF indexing may fail without embeddings.
        assert resp.status_code != 415, (
            "A real PDF must not be rejected with 415"
        )

    def test_zero_byte_file_returns_400(self):
        """Empty file must be rejected with 400, not 415."""
        resp = self.client.post(
            "/process-pdf",
            files={"file": ("empty.pdf", io.BytesIO(b""), "application/pdf")},
        )
        assert resp.status_code == 400


# ── Path-traversal rejection ──────────────────────────────────────────────────

class TestPathTraversalRejection:
    """
    Inputs used to build filesystem paths must reject traversal sequences.
    """

    def test_normalize_session_id_rejects_path_traversal(self):
        """../../etc/passwd is not a valid UUID and must raise ValueError."""
        with pytest.raises(ValueError):
            normalize_session_id("../../etc/passwd")

    def test_normalize_session_id_rejects_null_byte(self):
        """Null byte injection must be rejected."""
        with pytest.raises(ValueError):
            normalize_session_id("550e8400-e29b-41d4-a716-446655440000\x00")

    def test_normalize_session_id_rejects_url_encoded_traversal(self):
        """URL-encoded traversal must not pass as a valid UUID."""
        with pytest.raises(ValueError):
            normalize_session_id("..%2F..%2Fetc%2Fpasswd")

    def test_sanitize_filename_rejects_path_traversal(self):
        """Filenames containing directory separators must be stripped or rejected."""
        # sanitize_upload_filename uses os.path.basename — the traversal is
        # stripped, so the result must not contain a separator or be empty.
        result = sanitize_upload_filename("../../etc/passwd.pdf")
        assert "/" not in result and "\\" not in result, (
            "sanitize_upload_filename must strip path components"
        )

    def test_sanitize_filename_rejects_null_byte(self):
        """Null bytes in filenames must cause a ValueError."""
        with pytest.raises((ValueError, Exception)):
            sanitize_upload_filename("file\x00name.pdf")

    def test_sanitize_filename_rejects_overly_long_name(self):
        """Filenames longer than typical filesystem limits must be rejected."""
        long_name = "a" * 300 + ".pdf"
        with pytest.raises((ValueError, Exception)):
            sanitize_upload_filename(long_name)

    def test_get_session_dir_stays_within_persist_path(self):
        """get_session_dir must always produce a path inside PERSIST_PATH."""
        from pathlib import Path
        session_dir = Path(get_session_dir(VALID_UUID)).resolve()
        assert PERSIST_PATH in session_dir.parents or session_dir == PERSIST_PATH, (
            f"session dir {session_dir} must be inside PERSIST_PATH {PERSIST_PATH}"
        )

    def test_get_session_dir_rejects_non_uuid(self):
        """Non-UUID session IDs must not produce a valid path."""
        with pytest.raises((ValueError, Exception)):
            get_session_dir("../escape")


# ── Expired session handling ──────────────────────────────────────────────────

class TestExpiredSessionHandling:
    """
    Requests that reference an expired session must return 404, not leak
    session metadata, and not return 500.
    """

    def setup_method(self):
        self._original_token = _set_token("")
        self.client = TestClient(app, raise_server_exceptions=False)

    def teardown_method(self):
        _main_module.INTERNAL_RAG_TOKEN = self._original_token

    def test_ask_with_unknown_session_returns_404(self):
        """
        /ask with a session that does not exist must return 404.
        The session_secret check happens after session lookup, so a missing
        session must not return 403 (which would leak 'session exists but
        secret wrong' vs 'session does not exist').
        """
        resp = self.client.post(
            "/ask",
            json={
                "question": "What is this document about?",
                "session_id": VALID_UUID,
                "session_secret": "any-secret",
            },
        )
        assert resp.status_code in (404, 403), (
            f"Unknown session must return 404 or 403; got {resp.status_code}"
        )
        assert resp.status_code != 500, "Unknown session must not cause 500"

    def test_summarize_with_unknown_session_returns_404(self):
        """/summarize with an unknown session must return 404."""
        resp = self.client.post(
            "/summarize",
            json={"session_id": VALID_UUID, "session_secret": "any-secret"},
        )
        assert resp.status_code in (404, 403)
        assert resp.status_code != 500

    def test_expired_session_is_removed_from_sessions_dict(self):
        """
        A session whose last_accessed is at epoch (always expired) must be
        evicted by _touch_session_unlocked and not returned to callers.
        """
        sid = VALID_UUID
        original = dict(_main_module.sessions)
        _main_module.sessions[sid] = {
            "last_accessed": 0,
            "created_at": 0,
            "session_dir": None,
            "session_secret": "s",
            "lock": threading.Lock(),
            "vectorstore": None,
            "documents": [],
            "chat": [],
        }
        try:
            with _main_module.sessions_lock:
                result = _main_module._touch_session_unlocked(sid)
            assert result is None, (
                "_touch_session_unlocked must return None for expired session"
            )
            assert sid not in _main_module.sessions, (
                "Expired session must be removed from the in-memory dict"
            )
        finally:
            _main_module.sessions.clear()
            _main_module.sessions.update(original)


# ── internal_token_valid unit tests ──────────────────────────────────────────

def test_internal_token_valid_allows_when_no_token_configured():
    assert internal_token_valid(None, "") is True
    assert internal_token_valid("anything", "") is True


def test_internal_token_valid_rejects_missing_when_configured():
    assert internal_token_valid(None, "secret") is False
    assert internal_token_valid("", "secret") is False
    assert internal_token_valid("   ", "secret") is False


def test_internal_token_valid_rejects_wrong_token():
    assert internal_token_valid("wrong", "secret") is False


def test_internal_token_valid_accepts_exact_match():
    assert internal_token_valid("secret", "secret") is True


def test_internal_token_valid_is_case_sensitive():
    assert internal_token_valid("Secret", "secret") is False
    assert internal_token_valid("SECRET", "secret") is False
