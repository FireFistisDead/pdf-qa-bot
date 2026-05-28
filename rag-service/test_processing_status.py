from unittest.mock import MagicMock

# Prevent downloading/loading Hugging Face embeddings during testing by mocking the class
import langchain_community.embeddings

langchain_community.embeddings.HuggingFaceEmbeddings = MagicMock()

from fastapi.testclient import TestClient

import main


def test_processing_status_requires_internal_token_when_enabled(monkeypatch):
    monkeypatch.setattr(main, "INTERNAL_RAG_TOKEN", "secret")

    with main.sessions_lock:
        main.sessions.clear()

    client = TestClient(main.app)
    res = client.get("/processing-status/00000000-0000-0000-0000-000000000000")
    assert res.status_code == 403

    res = client.get(
        "/processing-status/00000000-0000-0000-0000-000000000000",
        headers={"X-Internal-Token": "secret"},
    )
    assert res.status_code == 404


def test_processing_status_is_pruned_with_session_ttl(monkeypatch):
    monkeypatch.setattr(main, "INTERNAL_RAG_TOKEN", "secret")

    session_id = "11111111-1111-1111-1111-111111111111"
    now = main.now_ts()

    with main.sessions_lock:
        main.sessions.clear()
        main.sessions[session_id] = {
            "vectorstore": None,
            "lock": None,
            "documents": [],
            "session_secret": "s",
            "session_dir": None,
            "created_at": now - 100,
            "last_accessed": now - 100,
            "retrieval_cache": {},
            "processing_progress": {"stage": "Starting", "progress": 5, "updated_at": now - 100},
        }

    client = TestClient(main.app)

    # With a long TTL, the status should be available.
    monkeypatch.setattr(main, "SESSION_TTL_MINUTES", 60)
    res = client.get(f"/processing-status/{session_id}?session_secret=s", headers={"X-Internal-Token": "secret"})
    assert res.status_code == 200
    assert res.json()["stage"] == "Starting"

    # With a zero TTL, the session should be pruned and status should disappear.
    monkeypatch.setattr(main, "SESSION_TTL_MINUTES", 0)
    res = client.get(f"/processing-status/{session_id}?session_secret=s", headers={"X-Internal-Token": "secret"})
    assert res.status_code == 404
