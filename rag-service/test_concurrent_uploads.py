"""Tests for concurrent upload concurrency fixes (issue #340)."""
import io
import os
import shutil
import threading
import time
from unittest.mock import MagicMock, patch

import langchain_community.embeddings
langchain_community.embeddings.HuggingFaceEmbeddings = MagicMock()

import pytest
from fastapi.testclient import TestClient

from main import (
    app,
    normalize_session_id,
    get_session_dir,
    session_store_lock,
    persist_vectorstore,
    MAX_DOCUMENTS_PER_SESSION,
    MAX_CHUNKS_PER_SESSION,
    sessions,
    sessions_lock,
)
from langchain_core.documents import Document


INTERNAL_TOKEN = "test-secret"
AUTH_HEADERS = {"X-Internal-Token": INTERNAL_TOKEN}


@pytest.fixture(autouse=True)
def cleanup_sessions_and_locks():
    yield
    with sessions_lock:
        keys = list(sessions.keys())
        for sid in keys:
            del sessions[sid]
    for f in os.listdir("."):
        if f.endswith(".lock"):
            try:
                os.remove(f)
            except Exception:  # nosec B110
                pass


def _fake_docs(text: str | None = None, n: int = 3) -> list:
    text = text or "Hello world. " * 50
    return [
        Document(page_content=text, metadata={"page": i, "filename": "fake.pdf", "source": "fake.pdf"})
        for i in range(n)
    ]


@pytest.fixture
def mock_pdf_pipeline():
    fake_docs = _fake_docs()
    with (
        patch("main.load_pdf_documents_async") as mock_extract,
        patch("main.FAISS.from_documents") as mock_from_docs,
        patch("main.get_embedding_model") as mock_emb,
    ):
        mock_extract.return_value = fake_docs
        mock_faiss = MagicMock()
        mock_faiss.merge_from.return_value = None
        mock_faiss.save_local.return_value = None
        mock_from_docs.return_value = mock_faiss
        mock_emb.return_value = MagicMock()
        yield mock_extract, mock_from_docs, mock_faiss


class TestSessionStoreLock:
    """Direct unit tests for the file-based per-session lock."""

    def test_lock_serializes_access(self):
        sid = "550e8400-e29b-41d4-a716-446655440000"
        results = []

        def worker(flag):
            with session_store_lock(sid):
                results.append(flag)
                time.sleep(0.3)
                results.append(flag)

        t1 = threading.Thread(target=worker, args=("A",))
        t2 = threading.Thread(target=worker, args=("B",))
        t1.start()
        time.sleep(0.05)
        t2.start()
        t1.join()
        t2.join()

        assert results == ["A", "A", "B", "B"]

    def test_different_sessions_dont_block(self):
        sid_a = "550e8400-e29b-41d4-a716-446655440aaa"
        sid_b = "550e8400-e29b-41d4-a716-446655440bbb"
        results = []

        def worker(sid, flag):
            with session_store_lock(sid):
                results.append(flag)
                time.sleep(0.3)
                results.append(flag)

        t1 = threading.Thread(target=worker, args=(sid_a, "A"))
        t2 = threading.Thread(target=worker, args=(sid_b, "B"))
        t1.start()
        time.sleep(0.05)
        t2.start()
        t1.join()
        t2.join()

        # B starts before A finishes (different sessions don't block)
        assert len(results) == 4
        assert results.count("A") == 2
        assert results.count("B") == 2


class TestConcurrentUploads:
    """Integration tests for concurrent /process-pdf calls."""

    SESSION_SECRET = "test_secret_val"

    @staticmethod
    def _make_pdf_bytes() -> io.BytesIO:
        return io.BytesIO(b"%PDF\n" + b"Hello world. " * 50)

    def _create_existing_session(self, session_id: str, doc_count: int = 0, chunks: int = 0):
        sid = normalize_session_id(session_id)
        docs = []
        for i in range(doc_count):
            docs.append({
                "document_id": f"doc_{i}",
                "filename": f"doc_{i}.pdf",
                "chunk_count": chunks // max(doc_count, 1) if doc_count else 0,
            })
        now = time.time()
        with sessions_lock:
            sessions[sid] = {
                "lock": threading.Lock(),
                "session_secret": self.SESSION_SECRET,
                "vectorstore": MagicMock(),
                "documents": docs,
                "last_accessed": now,
                "created_at": now,
                "session_dir": None,
                "retrieval_cache": {},
                "chat": [],
            }

    def _remove_session_dir(self, session_id: str):
        sdir = get_session_dir(session_id)
        if os.path.isdir(sdir):
            shutil.rmtree(sdir, ignore_errors=True)

    def test_concurrent_uploads_to_same_session(self, mock_pdf_pipeline):
        mock_extract, mock_from_docs, mock_faiss = mock_pdf_pipeline
        session_id = "550e8400-e29b-41d4-a716-446655440001"
        self._create_existing_session(session_id)

        client = TestClient(app)

        results = {}

        def upload(filename: str):
            fbytes = self._make_pdf_bytes()
            resp = client.post(
                "/process-pdf",
                data={
                    "session_id": session_id,
                    "session_secret": self.SESSION_SECRET,
                    "original_filename": filename,
                },
                files={"file": (filename, fbytes, "application/pdf")},
                headers=AUTH_HEADERS,
            )
            results[filename] = resp

        t1 = threading.Thread(target=upload, args=("a.pdf",))
        t2 = threading.Thread(target=upload, args=("b.pdf",))
        t1.start()
        t2.start()
        t1.join()
        t2.join()

        with sessions_lock:
            session = sessions.get(session_id)
        assert session is not None
        assert len(session["documents"]) == 2

    def test_concurrent_quota_enforced(self, mock_pdf_pipeline):
        mock_extract, mock_from_docs, mock_faiss = mock_pdf_pipeline
        session_id = "550e8400-e29b-41d4-a716-446655440002"
        self._create_existing_session(session_id, doc_count=MAX_DOCUMENTS_PER_SESSION - 2)

        client = TestClient(app)

        results = {}

        def upload(filename: str):
            fbytes = self._make_pdf_bytes()
            resp = client.post(
                "/process-pdf",
                data={
                    "session_id": session_id,
                    "session_secret": self.SESSION_SECRET,
                    "original_filename": filename,
                },
                files={"file": (filename, fbytes, "application/pdf")},
                headers=AUTH_HEADERS,
            )
            results[filename] = resp.status_code

        t1 = threading.Thread(target=upload, args=("a.pdf",))
        t2 = threading.Thread(target=upload, args=("b.pdf",))
        t3 = threading.Thread(target=upload, args=("c.pdf",))
        t1.start()
        t2.start()
        t3.start()
        t1.join()
        t2.join()
        t3.join()

        successes = [f for f, code in results.items() if code == 200]
        rejections = [f for f, code in results.items() if code == 400]

        assert len(successes) == 2
        assert len(rejections) == 1

        with sessions_lock:
            session = sessions.get(session_id)
        assert session is not None
        assert len(session["documents"]) == MAX_DOCUMENTS_PER_SESSION

    def test_rollback_on_merge_failure(self, mock_pdf_pipeline):
        mock_extract, mock_from_docs, mock_faiss = mock_pdf_pipeline
        session_id = "550e8400-e29b-41d4-a716-446655440003"
        self._create_existing_session(session_id, doc_count=1)

        with sessions_lock:
            sessions[session_id]["vectorstore"].merge_from.side_effect = ValueError("Simulated merge failure")

        client = TestClient(app)
        fbytes = self._make_pdf_bytes()
        resp = client.post(
            "/process-pdf",
            data={
                "session_id": session_id,
                "session_secret": self.SESSION_SECRET,
                "original_filename": "fail.pdf",
            },
            files={"file": ("fail.pdf", fbytes, "application/pdf")},
            headers=AUTH_HEADERS,
        )

        assert resp.status_code == 500

        with sessions_lock:
            session = sessions.get(session_id)
        assert session is not None
        assert len(session["documents"]) == 1

    def test_new_session_parallel_creates_distinct_sessions(self, mock_pdf_pipeline):
        mock_extract, mock_from_docs, mock_faiss = mock_pdf_pipeline
        client = TestClient(app)

        results = {}

        def upload(letter: str):
            fbytes = self._make_pdf_bytes()
            resp = client.post(
                "/process-pdf",
                data={"original_filename": f"{letter}.pdf"},
                files={"file": (f"{letter}.pdf", fbytes, "application/pdf")},
                headers=AUTH_HEADERS,
            )
            if resp.status_code == 200:
                results[letter] = resp.json()

        threads = [threading.Thread(target=upload, args=(l,)) for l in ("A", "B", "C")]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        assert len(results) == 3
        seen_ids = set()
        for letter, data in results.items():
            assert data["message"] == "PDF processed successfully"
            seen_ids.add(data["session_id"])
        assert len(seen_ids) == 3

    def test_cleanup_on_persist_failure(self, mock_pdf_pipeline):
        mock_extract, mock_from_docs, mock_faiss = mock_pdf_pipeline
        session_id = "550e8400-e29b-41d4-a716-446655440004"
        self._create_existing_session(session_id, doc_count=0)

        with sessions_lock:
            sessions[session_id]["vectorstore"].save_local.side_effect = RuntimeError("Disk full")

        client = TestClient(app)
        fbytes = self._make_pdf_bytes()
        resp = client.post(
            "/process-pdf",
            data={
                "session_id": session_id,
                "session_secret": self.SESSION_SECRET,
                "original_filename": "fail.pdf",
            },
            files={"file": ("fail.pdf", fbytes, "application/pdf")},
            headers=AUTH_HEADERS,
        )

        assert resp.status_code == 500

        with sessions_lock:
            session = sessions.get(session_id)
        assert session is not None
        assert len(session["documents"]) == 0

    def test_persisted_can_be_loaded(self, mock_pdf_pipeline):
        mock_extract, mock_from_docs, mock_faiss = mock_pdf_pipeline

        session_id = "550e8400-e29b-41d4-a716-446655440005"
        self._create_existing_session(session_id)
        self._remove_session_dir(session_id)

        sdir = get_session_dir(session_id)
        os.makedirs(sdir, exist_ok=True)

        vectorstore = MagicMock()
        vectorstore.save_local.return_value = None

        persist_vectorstore(session_id, vectorstore)

        assert os.path.isdir(sdir)
        assert not os.path.exists(sdir + ".tmp")

        shutil.rmtree(sdir, ignore_errors=True)
