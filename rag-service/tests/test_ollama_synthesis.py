"""
Unit tests for synthesize_with_ollama() in rag-service/main.py.

Run from the project root:
    python -m pytest rag-service/tests/test_ollama_synthesis.py -v

Requirements:
    pip install pytest
    (No Ollama or GPU needed — all HTTP calls are mocked.)
"""

import json
import os
import sys
import types
import unittest
from unittest.mock import MagicMock, patch
import urllib.error


# ---------------------------------------------------------------------------
# Minimal stubs so main.py can be imported without the heavy ML deps
# ---------------------------------------------------------------------------

def _stub_heavy_deps():
    """Inject lightweight stubs for torch, transformers, langchain, etc."""
    for name in [
        "torch", "numpy",
        "langchain_community", "langchain_community.vectorstores",
        "langchain_community.vectorstores.FAISS",
        "langchain_community.embeddings",
        "langchain_community.embeddings.HuggingFaceEmbeddings",
        "transformers",
        "rank_bm25",
        "pdf_parse_worker",
    ]:
        if name not in sys.modules:
            sys.modules[name] = types.ModuleType(name)

    # torch needs a no_grad context manager
    torch_stub = sys.modules["torch"]
    torch_stub.no_grad = lambda: _NullCtx()
    torch_stub.cuda = types.SimpleNamespace(is_available=lambda: False)

    # transformers stubs
    tf = sys.modules["transformers"]
    for attr in [
        "AutoConfig", "AutoTokenizer", "AutoModelForSeq2SeqLM",
        "AutoModelForCausalLM", "TextIteratorStreamer",
    ]:
        setattr(tf, attr, MagicMock())

    # rank_bm25
    sys.modules["rank_bm25"].BM25Okapi = MagicMock()

    # pdf_parse_worker
    sys.modules["pdf_parse_worker"]._extract_pdf_text_worker = MagicMock()

    # langchain FAISS / embeddings
    lc_vs = sys.modules["langchain_community.vectorstores"]
    lc_vs.FAISS = MagicMock()
    lc_emb = sys.modules["langchain_community.embeddings"]
    lc_emb.HuggingFaceEmbeddings = MagicMock()


class _NullCtx:
    def __enter__(self): return self
    def __exit__(self, *_): pass


# Set required env vars before importing main so module-level guards pass
os.environ.setdefault("JWT_SECRET", "test-secret-for-ci")
os.environ.setdefault("OLLAMA_BASE_URL", "http://localhost:11434")
os.environ.setdefault("OLLAMA_MODEL", "llama3")
os.environ.setdefault("OLLAMA_TIMEOUT_SECS", "5")

_stub_heavy_deps()

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from main import synthesize_with_ollama  # noqa: E402


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_response(body_dict: dict):
    """Return a mock that behaves like urllib's response context manager."""
    body = json.dumps(body_dict).encode()
    mock_resp = MagicMock()
    mock_resp.read.return_value = body
    mock_resp.__enter__ = lambda s: s
    mock_resp.__exit__ = MagicMock(return_value=False)
    return mock_resp


def _http_error(code: int, msg: str) -> urllib.error.HTTPError:
    """Construct an HTTPError with a None fp to avoid dict-as-HTTPMessage issues."""
    return urllib.error.HTTPError(url=None, code=code, msg=msg, hdrs=None, fp=None)


SAMPLE_PROMPT = (
    "Context:\n[Source 1 | Page 1]\nAnshuman Singh.\n\n"
    "Question: Who is this?\nAnswer:"
)


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

class TestSynthesizeWithOllama(unittest.TestCase):

    # ── Success path ──────────────────────────────────────────────────────────

    @patch("urllib.request.urlopen")
    def test_returns_generated_text_on_success(self, mock_urlopen):
        """Happy path: Ollama responds with a non-empty answer."""
        mock_urlopen.return_value = _make_response(
            {"response": "Anshuman Singh is a B.Tech student."}
        )
        result = synthesize_with_ollama(SAMPLE_PROMPT)
        self.assertEqual(result, "Anshuman Singh is a B.Tech student.")
        mock_urlopen.assert_called_once()

    @patch("urllib.request.urlopen")
    def test_strips_whitespace_from_response(self, mock_urlopen):
        """Trailing whitespace in the Ollama response is stripped."""
        mock_urlopen.return_value = _make_response({"response": "  Hello world.  \n"})
        result = synthesize_with_ollama(SAMPLE_PROMPT)
        self.assertEqual(result, "Hello world.")

    # ── Empty / missing response ───────────────────────────────────────────────

    @patch("urllib.request.urlopen")
    def test_returns_none_on_empty_response_field(self, mock_urlopen):
        """Ollama returns HTTP 200 but 'response' key is an empty string."""
        mock_urlopen.return_value = _make_response({"response": ""})
        result = synthesize_with_ollama(SAMPLE_PROMPT)
        self.assertIsNone(result)

    @patch("urllib.request.urlopen")
    def test_returns_none_when_response_key_missing(self, mock_urlopen):
        """Ollama returns HTTP 200 but the 'response' key is absent."""
        mock_urlopen.return_value = _make_response({"model": "llama3", "done": True})
        result = synthesize_with_ollama(SAMPLE_PROMPT)
        self.assertIsNone(result)

    # ── Network failures ───────────────────────────────────────────────────────

    @patch("urllib.request.urlopen", side_effect=ConnectionRefusedError("Connection refused"))
    def test_returns_none_when_ollama_not_running(self, _):
        """Ollama is not installed/started — connection refused."""
        self.assertIsNone(synthesize_with_ollama(SAMPLE_PROMPT))

    @patch("urllib.request.urlopen", side_effect=TimeoutError("timed out"))
    def test_returns_none_on_timeout(self, _):
        """Ollama takes too long — timeout fires."""
        self.assertIsNone(synthesize_with_ollama(SAMPLE_PROMPT))

    # ── HTTP error responses ──────────────────────────────────────────────────

    @patch("urllib.request.urlopen")
    def test_returns_none_on_http_404_model_not_found(self, mock_urlopen):
        """Ollama is running but the model has not been pulled yet."""
        mock_urlopen.side_effect = _http_error(404, "Not Found")
        self.assertIsNone(synthesize_with_ollama(SAMPLE_PROMPT))

    @patch("urllib.request.urlopen")
    def test_returns_none_on_http_500(self, mock_urlopen):
        """Ollama returns an internal server error."""
        mock_urlopen.side_effect = _http_error(500, "Internal Server Error")
        self.assertIsNone(synthesize_with_ollama(SAMPLE_PROMPT))

    # ── Malformed JSON ────────────────────────────────────────────────────────

    @patch("urllib.request.urlopen")
    def test_returns_none_on_invalid_json(self, mock_urlopen):
        """Ollama sends back garbage (not valid JSON)."""
        bad_resp = MagicMock()
        bad_resp.read.return_value = b"not json at all!!!"
        bad_resp.__enter__ = lambda s: s
        bad_resp.__exit__ = MagicMock(return_value=False)
        mock_urlopen.return_value = bad_resp
        self.assertIsNone(synthesize_with_ollama(SAMPLE_PROMPT))


if __name__ == "__main__":
    unittest.main()
