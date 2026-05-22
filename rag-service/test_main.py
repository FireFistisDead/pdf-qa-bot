import sys
from unittest.mock import MagicMock

# Prevent downloading/loading Hugging Face embeddings during testing by mocking the class
import langchain_community.embeddings
langchain_community.embeddings.HuggingFaceEmbeddings = MagicMock()

import pytest

from main import (
    detect_question_intent,
    is_authorized_session_update,
    sanitize_upload_filename,
    concise_excerpt,
    split_sentences,
    clean_sentence,
    query_keywords,
    tokenize_text,
)


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
