"""
Regression tests for issue #321: document_id regeneration in /process-pdf.

This test avoids heavy ML deps by stubbing FAISS + embeddings and by patching
PDF extraction + semantic chunking.
"""

import io
import os
import sys
import types
import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch


def _stub_heavy_deps():
    for name in [
        "torch",
        "numpy",
        "langchain_community",
        "langchain_community.vectorstores",
        "langchain_community.embeddings",
        "transformers",
        "rank_bm25",
        "pdf_parse_worker",
    ]:
        if name not in sys.modules:
            sys.modules[name] = types.ModuleType(name)

    torch_stub = sys.modules["torch"]
    torch_stub.no_grad = lambda: _NullCtx()
    torch_stub.cuda = types.SimpleNamespace(is_available=lambda: False)

    tf = sys.modules["transformers"]
    for attr in [
        "AutoConfig",
        "AutoTokenizer",
        "AutoModelForSeq2SeqLM",
        "AutoModelForCausalLM",
        "TextIteratorStreamer",
    ]:
        setattr(tf, attr, MagicMock())

    sys.modules["rank_bm25"].BM25Okapi = MagicMock()
    sys.modules["pdf_parse_worker"]._extract_pdf_text_worker = MagicMock()

    # Minimal placeholders so `from langchain_community.vectorstores import FAISS` works.
    lc_vs = sys.modules["langchain_community.vectorstores"]
    lc_vs.FAISS = MagicMock()
    lc_emb = sys.modules["langchain_community.embeddings"]
    lc_emb.HuggingFaceEmbeddings = MagicMock()


class _NullCtx:
    def __enter__(self):
        return self

    def __exit__(self, *_):
        return False


os.environ.setdefault("JWT_SECRET", "test-secret-for-ci")
os.environ.setdefault("INTERNAL_RAG_TOKEN", "test-secret")

_stub_heavy_deps()

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import main  # noqa: E402


class _DummyUploadFile:
    def __init__(self, filename: str, data: bytes):
        self.filename = filename
        self.file = io.BytesIO(data)


class _FakeVectorstore:
    def __init__(self, documents):
        self._documents = list(documents)
        self.docstore = SimpleNamespace(_dict={str(i): doc for i, doc in enumerate(self._documents)})

    def save_local(self, _path):
        return None

    def merge_from(self, _other):
        return None


class TestDocumentIdLineage(unittest.TestCase):
    def setUp(self):
        main.sessions.clear()
        main.processing_progress.clear()

    @patch.object(main, "cleanup_expired_sessions", lambda: None)
    def test_process_pdf_uses_single_document_id_for_chunks_and_session_record(self):
        # Stub "extracted" PDF pages
        stub_pages = [
            SimpleNamespace(page_content="hello world", metadata={"page": 0}),
            SimpleNamespace(page_content="second page", metadata={"page": 1}),
        ]

        def fake_semantic_chunk(page_text, filename, page_number, document_id):
            return [
                SimpleNamespace(
                    page_content=page_text,
                    metadata={
                        "document_id": document_id,
                        "filename": filename,
                        "page": page_number,
                        "chunk_index": 0,
                    },
                )
            ]

        with patch.object(main, "extract_pdf_documents_sandboxed", return_value=stub_pages), \
             patch.object(main, "semantic_chunk", side_effect=fake_semantic_chunk), \
             patch.object(main, "get_embedding_model", return_value=object()), \
             patch.object(main, "persist_vectorstore", return_value="test-session-dir"), \
             patch.object(main, "persist_session_registry_entry", lambda *_args, **_kwargs: None), \
             patch.object(main, "update_processing_progress", lambda *_args, **_kwargs: None), \
             patch.object(main.FAISS, "from_documents", side_effect=lambda docs, _emb: _FakeVectorstore(docs)):

            upload = _DummyUploadFile("sample.pdf", b"%PDF-1.4\\n%stub\\n")
            result = main.process_pdf(file=upload, original_filename="sample.pdf", session_id=None, session_secret=None)

        uploaded_document = result["document"]
        session_id = result["session_id"]

        session_meta = main.sessions.get(session_id)
        self.assertIsNotNone(session_meta)

        indexed_documents = main.collect_index_documents(session_meta["vectorstore"])
        self.assertGreater(len(indexed_documents), 0)

        # All chunks must carry the SAME document_id that was returned/stored for this upload.
        chunk_ids = {doc.metadata.get("document_id") for doc in indexed_documents}
        self.assertEqual(chunk_ids, {uploaded_document["document_id"]})

        # documents_for_upload must find matching chunks for the upload record.
        matches = main.documents_for_upload(indexed_documents, uploaded_document["document_id"])
        self.assertGreater(len(matches), 0)


if __name__ == "__main__":
    unittest.main()
