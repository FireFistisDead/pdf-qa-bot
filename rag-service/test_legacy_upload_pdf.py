from unittest.mock import MagicMock

# Prevent downloading/loading Hugging Face embeddings during testing by mocking the class
import langchain_community.embeddings

langchain_community.embeddings.HuggingFaceEmbeddings = MagicMock()

from fastapi.testclient import TestClient

import main


def test_upload_pdf_is_not_exposed_and_not_internal_auth_protected(monkeypatch):
    """
    The legacy /upload_pdf route was removed, but it must not remain in the internal-auth
    allowlist. Otherwise a missing route can incorrectly return 403 instead of 404,
    which is confusing and hides the true behavior.
    """
    monkeypatch.setattr(main, "INTERNAL_RAG_TOKEN", "secret")

    with main.sessions_lock:
        main.sessions.clear()

    client = TestClient(main.app)
    res = client.post("/upload_pdf")
    assert res.status_code == 404

    with main.sessions_lock:
        assert main.sessions == {}

