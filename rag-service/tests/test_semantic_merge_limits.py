"""Regression tests for semantic merge resource limits."""

import os
import sys
import types
import unittest
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


class _FakeEmbeddingModel:
    def __init__(self, embeddings):
        self.embeddings = embeddings
        self.calls = []

    def embed_documents(self, texts):
        self.calls.append(list(texts))
        return self.embeddings


class TestSemanticMergeLimits(unittest.TestCase):
    def test_split_pass2_merges_normal_small_input(self):
        fake_model = _FakeEmbeddingModel([[1.0, 0.0], [1.0, 0.0]])

        with patch.object(main, "get_embedding_model", return_value=fake_model):
            result = main._split_pass2(
                ["alpha", "beta"],
                threshold=0.5,
                merge_min=32,
                merge_max=128,
            )

        self.assertEqual(result, ["alpha beta"])
        self.assertEqual(len(fake_model.calls), 1)

    def test_split_pass2_skips_merge_when_tiny_chunk_limit_is_exceeded(self):
        fake_model = _FakeEmbeddingModel([])
        raw_chunks = [f"tiny-{idx}" for idx in range(5)]

        with patch.object(main, "SEMANTIC_CHUNK_MAX_TINY_CHUNKS", 3), \
             patch.object(main, "get_embedding_model", return_value=fake_model):
            result = main._split_pass2(
                raw_chunks,
                threshold=0.5,
                merge_min=64,
                merge_max=256,
            )

        self.assertEqual(result, raw_chunks)
        self.assertEqual(fake_model.calls, [])

    def test_split_pass2_skips_merge_when_candidate_limit_is_exceeded(self):
        fake_model = _FakeEmbeddingModel([])
        raw_chunks = ["a", "long chunk", "b", "long chunk", "c"]

        with patch.object(main, "SEMANTIC_CHUNK_MAX_TINY_CHUNKS", 10), \
             patch.object(main, "SEMANTIC_CHUNK_MAX_MERGE_CANDIDATES", 4), \
             patch.object(main, "get_embedding_model", return_value=fake_model):
            result = main._split_pass2(
                raw_chunks,
                threshold=0.5,
                merge_min=32,
                merge_max=256,
            )

        self.assertEqual(result, raw_chunks)
        self.assertEqual(fake_model.calls, [])


if __name__ == "__main__":
    unittest.main()