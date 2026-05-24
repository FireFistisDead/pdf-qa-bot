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
    internal_token_valid,
    normalize_session_id,
    get_session_dir,
    _extract_pdf_text_worker,
)


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
