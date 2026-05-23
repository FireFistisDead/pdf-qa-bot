from fastapi import FastAPI, Request, HTTPException, File, UploadFile, Form
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.exceptions import RequestValidationError
from pydantic import BaseModel, Field, field_validator
from pathlib import Path
from uuid import UUID
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_community.vectorstores import FAISS
from langchain_community.embeddings import HuggingFaceEmbeddings
from dotenv import load_dotenv
from rank_bm25 import BM25Okapi
from langchain_community.vectorstores import FAISS
import numpy as np
import os
import shutil
import uuid
import uvicorn
import torch
import multiprocessing
from transformers import (
    AutoConfig,
    AutoTokenizer,
    AutoModelForSeq2SeqLM,
    AutoModelForCausalLM,
    TextIteratorStreamer,
)
import threading
import time
import logging
import re

load_dotenv()


PERSIST_DIR = "faiss_store"
# ── Logger (must be defined before exception handlers that use it) ─────────────
logger = logging.getLogger("pdf_qa_rag")
logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)

app = FastAPI()
# Global session store
sessions = {}
processing_progress = {}
def update_processing_progress(session_id, stage, progress):
    processing_progress[session_id] = {
        "stage": stage,
        "progress": progress,
        "updated_at": now_ts(),
    }

INTERNAL_RAG_TOKEN = os.getenv("INTERNAL_RAG_TOKEN", "").strip()

PDF_PARSE_TIMEOUT_SECONDS = int(os.getenv("PDF_PARSE_TIMEOUT_SECONDS", "20"))
MAX_PDF_PAGES = int(os.getenv("MAX_PDF_PAGES", "200"))
MAX_PDF_EXTRACT_CHARS = int(os.getenv("MAX_PDF_EXTRACT_CHARS", "400000"))

try:
    from langchain_core.documents import Document  # type: ignore
except Exception:  # pragma: no cover
    from langchain.schema import Document  # type: ignore

def internal_token_valid(provided: str | None, expected: str) -> bool:
    if not expected:
        return True
    candidate = (provided or "").strip()
    return bool(candidate) and candidate == expected


def standard_error_response(status_code: int, detail: str, **extra):
    payload = {
        "error": detail,
        "detail": detail,
        **extra,
    }
    return JSONResponse(status_code=status_code, content=payload)

def _extract_pdf_text_worker(
    pdf_path: str,
    max_pages: int,
    max_chars: int,
    out_queue: "multiprocessing.Queue",
):
    """
    Runs in a separate process so the parent can hard-timeout / terminate if PDF parsing
    becomes pathological (DoS-grade PDFs).
    """
    try:
        from pypdf import PdfReader  # local import to keep startup light

        reader = PdfReader(pdf_path, strict=False)

        # Some PDFs are encrypted (or malformed) and can throw lazily; attempt decrypt best-effort.
        if getattr(reader, "is_encrypted", False):
            try:
                reader.decrypt("")  # type: ignore[attr-defined]
            except Exception:
                out_queue.put({"ok": False, "error": "Unable to read this PDF. It may be encrypted."})
                return

        pages = getattr(reader, "pages", [])
        page_count = len(pages)
        if page_count == 0:
            out_queue.put({"ok": False, "error": "No readable pages were found in the PDF."})
            return
        if page_count > max_pages:
            out_queue.put(
                {
                    "ok": False,
                    "error": f"PDF has too many pages ({page_count}). Max allowed is {max_pages}.",
                    "page_count": page_count,
                }
            )
            return

        extracted = []
        used = 0
        for idx, page in enumerate(pages):
            if idx >= max_pages:
                break
            text = page.extract_text() or ""
            if not text.strip():
                continue

            remaining = max_chars - used
            if remaining <= 0:
                break
            if len(text) > remaining:
                text = text[:remaining]
            used += len(text)
            extracted.append({"page": idx, "text": text})

        if not extracted:
            out_queue.put({"ok": False, "error": "No readable text was found in the PDF."})
            return

        out_queue.put(
            {
                "ok": True,
                "page_count": page_count,
                "extracted": extracted,
                "extracted_chars": used,
            }
        )
    except Exception as exc:
        out_queue.put({"ok": False, "error": "Unable to read this PDF. It may be corrupted.", "details": str(exc)})


def extract_pdf_documents_sandboxed(pdf_path: str, filename: str):
    """
    Parse PDF in a separate process with hard timeout and page/size limits.

    Returns: List[Document]
    Raises: HTTPException on failure.
    """
    start = time.time()
    ctx = multiprocessing.get_context("spawn")
    out_queue = ctx.Queue(maxsize=1)
    proc = ctx.Process(
        target=_extract_pdf_text_worker,
        args=(pdf_path, MAX_PDF_PAGES, MAX_PDF_EXTRACT_CHARS, out_queue),
        daemon=True,
    )
    proc.start()
    proc.join(timeout=PDF_PARSE_TIMEOUT_SECONDS)

    if proc.is_alive():
        logger.warning(
            "PDF parse timeout filename=%s timeout_seconds=%s",
            filename,
            PDF_PARSE_TIMEOUT_SECONDS,
        )
        proc.terminate()
        proc.join(timeout=2)
        raise HTTPException(
            status_code=422,
            detail=(
                "PDF parsing timed out. This PDF may be too complex or malformed. "
                "Try a smaller/simpler PDF."
            ),
        )

    try:
        result = out_queue.get_nowait()
    except Exception:
        raise HTTPException(status_code=400, detail="Unable to read this PDF.")

    if not isinstance(result, dict) or not result.get("ok"):
        error = (result or {}).get("error") if isinstance(result, dict) else None
        raise HTTPException(status_code=400, detail=error or "Unable to read this PDF.")

    extracted = result.get("extracted", [])
    extracted_chars = int(result.get("extracted_chars", 0) or 0)
    page_count = int(result.get("page_count", 0) or 0)
    elapsed_ms = int((time.time() - start) * 1000)

    logger.info(
        "PDF parsed safely filename=%s pages=%s extracted_pages=%s extracted_chars=%s duration_ms=%s",
        filename,
        page_count,
        len(extracted),
        extracted_chars,
        elapsed_ms,
    )

    docs = []
    for item in extracted:
        page = item.get("page")
        text = (item.get("text") or "").strip()
        if not text:
            continue
        docs.append(
            Document(
                page_content=text,
                metadata={
                    "page": page,
                    "filename": filename,
                    "source": filename,
                },
            )
        )
    if not docs:
        raise HTTPException(status_code=400, detail="No readable text was found in the PDF.")
    return docs

@app.middleware("http")
async def internal_auth_middleware(request: Request, call_next):
    """
    Enforce service-to-service auth for RAG endpoints when INTERNAL_RAG_TOKEN is set.

    This prevents attackers from bypassing the API gateway's rate limits by calling
    the RAG service directly (for example when port 5000 is accidentally exposed).
    """
    if INTERNAL_RAG_TOKEN and request.url.path in {
        "/process-pdf",
        "/ask",
        "/summarize",
        "/upload_pdf",
    }:
        provided = request.headers.get("X-Internal-Token")
        if not internal_token_valid(provided, INTERNAL_RAG_TOKEN):
            return standard_error_response(403, "Forbidden")

    return await call_next(request)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    errors = [
        {"loc": err["loc"], "msg": err["msg"], "type": err["type"]}
        for err in exc.errors()
    ]
    logger.warning("Request validation failed path=%s errors=%s", request.url.path, errors)
    return standard_error_response(422, "Validation failed", details=errors)


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    detail = exc.detail
    if not isinstance(detail, str):
        detail = str(detail)
    return standard_error_response(exc.status_code, detail)


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    print(f"Unhandled exception: {exc}")
    return standard_error_response(500, "Internal server error. Please try again later.")


# Session storage with metadata and thread safety

sessions_lock = threading.Lock()
model_load_lock = threading.Lock()
generation_lock = threading.Lock()

# Configurable session TTL and max cap
SESSION_TTL_MINUTES = int(os.getenv("SESSION_TTL_MINUTES", "30"))
MAX_ACTIVE_SESSIONS = int(os.getenv("MAX_ACTIVE_SESSIONS", "100"))
MAX_DOCUMENTS_PER_SESSION = int(os.getenv("MAX_DOCUMENTS_PER_SESSION", "5"))
MAX_CHUNKS_PER_SESSION = int(os.getenv("MAX_CHUNKS_PER_SESSION", "2000"))
ASK_RETRIEVAL_CANDIDATES = int(os.getenv("ASK_RETRIEVAL_CANDIDATES", "12"))
ASK_MAX_CONTEXT_CHUNKS = int(os.getenv("ASK_MAX_CONTEXT_CHUNKS", "6"))
ASK_CHUNKS_PER_DOCUMENT = int(os.getenv("ASK_CHUNKS_PER_DOCUMENT", "2"))
ASK_DIVERSITY_RANK_LIMIT = int(os.getenv("ASK_DIVERSITY_RANK_LIMIT", "8"))
ASK_DIVERSITY_SCORE_MULTIPLIER = float(os.getenv("ASK_DIVERSITY_SCORE_MULTIPLIER", "1.8"))
ASK_DIVERSITY_SCORE_MARGIN = float(os.getenv("ASK_DIVERSITY_SCORE_MARGIN", "0.35"))
ASK_EVIDENCE_MAX_DISTANCE = float(os.getenv("ASK_EVIDENCE_MAX_DISTANCE", "0.85"))
ASK_EVIDENCE_MIN_KEYWORD_OVERLAP = int(os.getenv("ASK_EVIDENCE_MIN_KEYWORD_OVERLAP", "2"))
ASK_EVIDENCE_MIN_KEYWORD_OVERLAP_SHORT_QUERY = int(
    os.getenv("ASK_EVIDENCE_MIN_KEYWORD_OVERLAP_SHORT_QUERY", "1")
)
ASK_REQUIRE_CITATIONS = os.getenv("ASK_REQUIRE_CITATIONS", "true").strip().lower() in {
    "1",
    "true",
    "yes",
    "on",
}
QUERY_STOPWORDS = {
    "about", "according", "also", "and", "are", "between", "compare",
    "describe", "does", "document", "documents", "explain", "from", "give",
    "how", "into", "is", "of", "pdf", "pdfs", "related", "summarize",
    "tell", "the", "their", "these", "this", "to", "uploaded", "what", "with",
}
RELATIONSHIP_QUERY_TERMS = {
    "associated", "connection", "linked", "relation", "relationship", "related",
}
COMPARISON_QUERY_TERMS = {
    "between", "compare", "comparison", "contrast", "difference",
    "different", "role", "versus", "vs",
}
OVERVIEW_QUERY_TERMS = {
    "across", "all", "covered", "coverage", "documents", "files",
    "multiple", "overall", "overview", "summarize", "topics",
}
INSUFFICIENT_CONTEXT_MESSAGE = "The uploaded documents do not contain enough information to answer this question."
BASE_DIR = Path(__file__).resolve().parent.parent
UPLOADS_DIR = (BASE_DIR / "uploads").resolve()
UPLOAD_FILENAME_CHARS = frozenset(
    "abcdefghijklmnopqrstuvwxyz"
    "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    "0123456789"
    "._-"
)
FACTUAL_QUESTION_PREFIXES = (
    ("what", "is"), ("what", "are"), ("what", "was"), ("what", "were"),
    ("who", "is"), ("who", "are"), ("who", "was"), ("who", "were"),
    ("where", "is"), ("where", "are"), ("where", "was"), ("where", "were"),
    ("when", "is"), ("when", "are"), ("when", "was"), ("when", "were"),
)


def now_ts():
    return time.time()


def cleanup_expired_sessions():
    """
    Remove expired sessions and enforce max session cap.
    """
    expired = []
    evicted_count = 0
    active_sessions = 0
    with sessions_lock:
        ttl_seconds = SESSION_TTL_MINUTES * 60
        for sid, meta in list(sessions.items()):
            if now_ts() - meta["last_accessed"] > ttl_seconds:
                expired.append(sid)
        for sid in expired:
            del sessions[sid]
        while len(sessions) > MAX_ACTIVE_SESSIONS:
            oldest = min(sessions.items(), key=lambda x: x[1]["created_at"])[0]
            del sessions[oldest]
            evicted_count += 1
        active_sessions = len(sessions)
    if expired or evicted_count:
        logger.info(
            "Session cleanup completed expired=%s evicted=%s active=%s",
            len(expired),
            evicted_count,
            active_sessions,
        )


def _is_session_expired(meta: dict) -> bool:
    ttl_seconds = SESSION_TTL_MINUTES * 60
    return now_ts() - meta["last_accessed"] > ttl_seconds


def _touch_session_unlocked(session_id: str):
    meta = sessions.get(session_id)
    if not meta:
        return None
    if _is_session_expired(meta):
        del sessions[session_id]
        logger.info("Session expired session_id=%s", session_id)
        return None
    meta["last_accessed"] = now_ts()
    return meta


def _peek_session_unlocked(session_id: str):
    """Read session metadata without refreshing last_accessed.

    Use this for validation and quota checks where we must not side-effect the
    TTL. An attacker who is rejected at the quota boundary should NOT be able
    to keep an at-cap session alive by spamming the error response.
    Only call _touch_session_unlocked once all checks pass and the operation
    is actually going to succeed.
    """
    meta = sessions.get(session_id)
    if not meta:
        return None
    if _is_session_expired(meta):
        del sessions[session_id]
        logger.info("Session expired session_id=%s", session_id)
        return None
    return meta


def _cleanup_expired_sessions_unlocked():
    """Must be called with sessions_lock held."""
    ttl_seconds = SESSION_TTL_MINUTES * 60
    expired = [
        sid for sid, meta in list(sessions.items())
        if now_ts() - meta["last_accessed"] > ttl_seconds
    ]
    for sid in expired:
        del sessions[sid]
    if expired:
        logger.info("Expired sessions removed count=%s", len(expired))


def _enforce_max_sessions_unlocked():
    while len(sessions) >= MAX_ACTIVE_SESSIONS:
        oldest = min(sessions.items(), key=lambda x: x[1]["created_at"])[0]
        del sessions[oldest]
        logger.info("Evicted oldest session session_id=%s", oldest)


def validate_existing_session(session_id: str):
    if not session_id:
        return None
    with sessions_lock:
        return _touch_session_unlocked(session_id)


def get_session_documents(session_id: str):
    with sessions_lock:
        meta = _touch_session_unlocked(session_id)
        if not meta:
            return None, []
        return meta, list(meta.get("documents", []))


def unique_documents(documents):
    seen = set()
    unique = []
    for doc in documents:
        key = document_dedupe_key(doc)
        if key in seen:
            continue
        seen.add(key)
        unique.append(doc)
    return unique


def document_identity(document):
    return (
        document.metadata.get("document_id")
        or document.metadata.get("filename")
        or document.metadata.get("source")
        or "unknown-document"
    )


def document_display_name(document):
    return (
        document.metadata.get("filename")
        or os.path.basename(document.metadata.get("source", ""))
        or "uploaded document"
    )


def document_dedupe_key(document):
    source = document.metadata.get("filename") or document.metadata.get("source", "")
    page = document.metadata.get("page", "")
    content_key = " ".join(document.page_content.split())[:500]
    return (document_identity(document), source, page, content_key)


def query_keywords(question):
    return {
        token
        for token in re.findall(r"[a-zA-Z0-9]+", question.lower())
        if len(token) > 2 and token not in QUERY_STOPWORDS
    }


def tokenize_text(text):
    return set(re.findall(r"[a-zA-Z0-9]+", text.lower()))


def document_matches_query_terms(document, keywords):
    if not keywords:
        return False
    document_text = " ".join(
        [
            document.page_content,
            document.metadata.get("filename", ""),
            document.metadata.get("source", ""),
        ]
    ).lower()
    document_terms = tokenize_text(document_text)
    return bool(keywords.intersection(document_terms))


def detect_question_intent(question):
    normalized_question = question.lower()
    terms = tokenize_text(normalized_question)

    if "what is this document about" in normalized_question or "what are these documents about" in normalized_question:
        return "overview"
    if "how is" in normalized_question and terms.intersection(RELATIONSHIP_QUERY_TERMS):
        return "relationship"
    if terms.intersection(RELATIONSHIP_QUERY_TERMS):
        return "relationship"
    if terms.intersection(COMPARISON_QUERY_TERMS):
        return "comparison"
    if (
        terms.intersection(OVERVIEW_QUERY_TERMS)
        or "summarize all" in normalized_question
        or "across uploaded documents" in normalized_question
    ):
        return "overview"
    return "factual"

def normalize_query(query: str) -> str:
    return " ".join(query.lower().strip().split())

def concise_excerpt(text, max_chars=420):
    normalized_text = " ".join(text.split())
    if len(normalized_text) <= max_chars:
        return normalized_text
    return normalized_text[:max_chars].rsplit(" ", 1)[0] + "..."


def split_sentences(text):
    normalized_text = " ".join(text.split())
    if not normalized_text:
        return []
    return [
        sentence.strip()
        for sentence in re.split(r"(?<=[.!?])\s+", normalized_text)
        if sentence.strip()
    ]


def clean_sentence(sentence):
    return sentence.strip().strip("-* ").rstrip()


def document_sentences(document, max_sentences=3):
    return [
        clean_sentence(sentence)
        for sentence in split_sentences(document.page_content)[:max_sentences]
        if clean_sentence(sentence)
    ]


def group_documents_by_source(documents):
    grouped_documents = {}
    for document in documents:
        source_name = document_display_name(document)
        grouped_documents.setdefault(source_name, []).append(document)
    return grouped_documents


def best_sentences_for_document(documents, question=None, max_sentences=2):
    keywords = query_keywords(question or "")
    scored_sentences = []

    for document in documents:
        for sentence in document_sentences(document, max_sentences=6):
            sentence_terms = tokenize_text(sentence)
            overlap = len(keywords.intersection(sentence_terms)) if keywords else 0
            scored_sentences.append((overlap, sentence))

    scored_sentences.sort(key=lambda item: item[0], reverse=True)
    selected_sentences = []
    seen = set()
    for _score, sentence in scored_sentences:
        sentence_key = sentence.lower()
        if sentence_key in seen:
            continue
        seen.add(sentence_key)
        selected_sentences.append(sentence)
        if len(selected_sentences) >= max_sentences:
            break

    return selected_sentences


def has_grounded_keyword_overlap(question, documents):
    keywords = query_keywords(question)
    if not keywords:
        return True
    for document in documents:
        document_text = " ".join(
            [
                document.page_content,
                document.metadata.get("filename", ""),
                document.metadata.get("source", ""),
            ]
        )
        if keywords.intersection(tokenize_text(document_text)):
            return True
    return False


def best_keyword_overlap_count(question, documents):
    keywords = query_keywords(question)
    if not keywords:
        return 0
    best = 0
    for document in documents:
        document_text = " ".join(
            [
                document.page_content,
                document.metadata.get("filename", ""),
                document.metadata.get("source", ""),
            ]
        )
        overlap = len(keywords.intersection(tokenize_text(document_text)))
        best = max(best, overlap)
    return best


def passes_evidence_gate(question, documents, best_score, intent):
    if not documents:
        return False
    if intent == "overview":
        return True

    keywords = query_keywords(question)
    if not keywords:
        return True

    required_overlap = (
        ASK_EVIDENCE_MIN_KEYWORD_OVERLAP_SHORT_QUERY
        if len(keywords) < 4
        else ASK_EVIDENCE_MIN_KEYWORD_OVERLAP
    )
    if best_keyword_overlap_count(question, documents) < required_overlap:
        return False

    if best_score is None:
        return True
    return best_score <= ASK_EVIDENCE_MAX_DISTANCE


def citation_suffix_for_documents(documents, source_id_by_key):
    if not source_id_by_key:
        return ""
    ids = sorted(
        {
            source_id_by_key.get(document_dedupe_key(document))
            for document in documents
            if document is not None
        }
    )
    ids = [value for value in ids if isinstance(value, int)]
    if not ids:
        return ""
    if len(ids) == 1:
        return f" (Source {ids[0]})"
    joined = ", ".join(str(value) for value in ids)
    return f" (Sources {joined})"


def answer_contains_citation(answer, max_source_id):
    if not answer or not isinstance(answer, str):
        return False
    if not max_source_id or max_source_id < 1:
        return False
    # We accept either "Source 1" or "Sources 1, 2".
    return bool(re.search(r"\bSources?\s+\d+", answer))


def markdown_bullets(sentences):
    return "\n".join(f"* {sentence}" for sentence in sentences)


def build_relationship_answer(documents, question, source_id_by_key=None):
    grouped_documents = group_documents_by_source(documents)
    if len(grouped_documents) < 2:
        return None
    answer_parts = ["Based on the uploaded documents:"]
    for source_name, source_documents in grouped_documents.items():
        sentences = best_sentences_for_document(source_documents, question, max_sentences=2)
        if sentences:
            citation_suffix = citation_suffix_for_documents(source_documents, source_id_by_key)
            answer_parts.append(f"* **{source_name}**{citation_suffix}: {' '.join(sentences)}")
    source_list = ", ".join(grouped_documents.keys())
    answer_parts.append(
        f"\nTogether, these points show the relationship across {source_list} without using information outside the uploaded documents."
    )
    return "\n".join(answer_parts)


def build_comparison_answer(documents, question, source_id_by_key=None):
    grouped_documents = group_documents_by_source(documents)
    if len(grouped_documents) < 2:
        return None
    answer_parts = ["Based on the uploaded documents:"]
    for source_name, source_documents in grouped_documents.items():
        sentences = best_sentences_for_document(source_documents, question, max_sentences=2)
        if sentences:
            citation_suffix = citation_suffix_for_documents(source_documents, source_id_by_key)
            answer_parts.append(f"* **{source_name}**{citation_suffix}: {' '.join(sentences)}")
    answer_parts.append(
        "\nIn comparison, each document describes a different role or focus, and the contrast above is limited to the retrieved PDF content."
    )
    return "\n".join(answer_parts)


def build_overview_answer(documents, question, source_id_by_key=None):
    grouped_documents = group_documents_by_source(documents)
    if not grouped_documents:
        return None
    answer_parts = ["The uploaded documents cover:"]
    for source_name, source_documents in grouped_documents.items():
        sentences = best_sentences_for_document(source_documents, question, max_sentences=2)
        if sentences:
            citation_suffix = citation_suffix_for_documents(source_documents, source_id_by_key)
            answer_parts.append(f"* **{source_name}**{citation_suffix}: {' '.join(sentences)}")
    return "\n".join(answer_parts)


def strip_trailing_question_punctuation(text):
    end = len(text)
    while end > 0 and text[end - 1] in "?.!":
        end -= 1
    return text[:end].strip()


def extract_factual_subject(question):
    words = question.strip().split(maxsplit=2)
    if len(words) < 3:
        return None
    prefix = (words[0].lower(), words[1].lower())
    if prefix not in FACTUAL_QUESTION_PREFIXES:
        return None
    subject = strip_trailing_question_punctuation(words[2])
    return subject or None


def build_factual_answer(documents, question, source_id_by_key=None):
    if not has_grounded_keyword_overlap(question, documents):
        return None
    subject = extract_factual_subject(question)
    keywords = query_keywords(subject or question)
    grouped_documents = group_documents_by_source(documents)
    supporting_sentences = []
    for source_name, source_documents in grouped_documents.items():
        sentences = best_sentences_for_document(source_documents, subject or question, max_sentences=2)
        for sentence in sentences:
            if keywords and not keywords.intersection(tokenize_text(sentence)):
                continue
            supporting_sentences.append((source_name, sentence))
    if not supporting_sentences:
        return None
    source_name, first_sentence = supporting_sentences[0]
    citation_suffix = citation_suffix_for_documents(grouped_documents.get(source_name, []), source_id_by_key)
    if subject:
        if "document" in subject.lower() and "about" in subject.lower():
            answer = f"Based on **{source_name}**{citation_suffix}, {first_sentence}"
        else:
            answer = f"Based on **{source_name}**{citation_suffix}, {subject} is mentioned in this context: {first_sentence}"
    else:
        answer = f"Based on **{source_name}**{citation_suffix}, {first_sentence}"
    additional_sentences = [
        sentence
        for _source, sentence in supporting_sentences[1:3]
        if sentence.lower() != first_sentence.lower()
    ]
    if additional_sentences:
        answer += " " + " ".join(additional_sentences)
    return answer


def build_answer_from_documents(question, documents, intent, source_id_by_key=None):
    if not has_grounded_keyword_overlap(question, documents) and intent != "overview":
        return INSUFFICIENT_CONTEXT_MESSAGE
    if intent == "relationship":
        return build_relationship_answer(documents, question, source_id_by_key=source_id_by_key) or INSUFFICIENT_CONTEXT_MESSAGE
    if intent == "comparison":
        return build_comparison_answer(documents, question, source_id_by_key=source_id_by_key) or INSUFFICIENT_CONTEXT_MESSAGE
    if intent == "overview":
        return build_overview_answer(documents, question, source_id_by_key=source_id_by_key) or INSUFFICIENT_CONTEXT_MESSAGE
    if intent == "factual":
        return build_factual_answer(documents, question, source_id_by_key=source_id_by_key) or INSUFFICIENT_CONTEXT_MESSAGE
    return INSUFFICIENT_CONTEXT_MESSAGE


def build_document_summary_bullets(documents, max_bullets=3):
    sentences = best_sentences_for_document(documents, max_sentences=max_bullets)
    if not sentences:
        return ["No readable summary content was found."]
    return sentences


def shared_terms_between_documents(grouped_documents):
    document_term_sets = []
    for source_documents in grouped_documents.values():
        source_text = " ".join(document.page_content for document in source_documents)
        terms = {
            term
            for term in tokenize_text(source_text)
            if len(term) > 3 and term not in QUERY_STOPWORDS
        }
        if terms:
            document_term_sets.append(terms)
    if len(document_term_sets) < 2:
        return set()
    shared_terms = set.intersection(*document_term_sets)
    return shared_terms


def build_combined_insights(grouped_documents):
    if len(grouped_documents) < 2:
        return []
    insights = []
    shared_terms = shared_terms_between_documents(grouped_documents)
    if shared_terms:
        shared_text = ", ".join(sorted(shared_terms)[:5])
        insights.append(f"Shared concepts across documents include {shared_text}.")
    source_descriptions = []
    for source_name, source_documents in grouped_documents.items():
        sentences = build_document_summary_bullets(source_documents, max_bullets=1)
        if sentences:
            source_descriptions.append(f"{source_name} focuses on {sentences[0]}")
    if source_descriptions:
        insights.append(" ".join(source_descriptions))
    if not insights:
        insights.append("The uploaded documents cover distinct but related areas of the session context.")
    return insights[:3]


def build_session_summary(uploaded_documents, indexed_documents):
    document_summaries = []
    grouped_for_insights = {}
    for uploaded_document in uploaded_documents:
        document_chunks = documents_for_upload(indexed_documents, uploaded_document["document_id"])
        document_chunks = unique_documents(document_chunks)
        filename = uploaded_document["filename"]
        grouped_for_insights[filename] = document_chunks
        bullets = build_document_summary_bullets(document_chunks)
        document_summaries.append(f"## {filename}\n\n{markdown_bullets(bullets)}")
    combined_insights = build_combined_insights(grouped_for_insights)
    if combined_insights:
        document_summaries.append(f"## Combined Insights\n\n{markdown_bullets(combined_insights)}")
    return "\n\n".join(document_summaries)


def representative_documents_by_source(documents, per_document_limit=2, max_documents=ASK_MAX_CONTEXT_CHUNKS):
    grouped_documents = group_documents_by_source(unique_documents(documents))
    representatives = []
    for source_documents in grouped_documents.values():
        representatives.extend(source_documents[:per_document_limit])
        if len(representatives) >= max_documents:
            break
    return representatives[:max_documents]


def search_retrieval_candidates(vectorstore, question, candidate_count):
    try:
        scored_documents = vectorstore.similarity_search_with_score(question, k=candidate_count)
        return [
            (document, float(score), rank)
            for rank, (document, score) in enumerate(scored_documents)
        ]
    except Exception:
        logger.debug("Falling back to similarity_search without scores", exc_info=True)
        documents = vectorstore.similarity_search(question, k=candidate_count)
        return [
            (document, float(rank), rank)
            for rank, document in enumerate(documents)
        ]


def dedupe_scored_candidates(scored_candidates):
    seen = set()
    unique_candidates = []
    for document, score, rank in scored_candidates:
        key = document_dedupe_key(document)
        if key in seen:
            continue
        seen.add(key)
        unique_candidates.append((document, score, rank))
    return unique_candidates


def group_candidates_by_document(scored_candidates):
    grouped_candidates = {}
    document_order = []
    for document, score, rank in scored_candidates:
        document_id = document_identity(document)
        if document_id not in grouped_candidates:
            grouped_candidates[document_id] = []
            document_order.append(document_id)
        grouped_candidates[document_id].append((document, score, rank))
    return grouped_candidates, document_order


def is_candidate_document_relevant(best_score, document_best_score, document_best_rank, document, keywords):
    if document_best_rank <= 1:
        return True
    if document_best_rank > ASK_DIVERSITY_RANK_LIMIT:
        return False
    score_cutoff = max(
        best_score + ASK_DIVERSITY_SCORE_MARGIN,
        best_score * ASK_DIVERSITY_SCORE_MULTIPLIER,
    )
    return (
        document_best_score <= score_cutoff
        or document_matches_query_terms(document, keywords)
    )


def diversify_retrieved_documents(scored_candidates, question):
    unique_candidates = dedupe_scored_candidates(scored_candidates)
    if not unique_candidates:
        return []
    grouped_candidates, document_order = group_candidates_by_document(unique_candidates)
    best_score = unique_candidates[0][1]
    keywords = query_keywords(question)
    selected_candidates = []
    relevant_document_ids = []
    for document_id in document_order:
        document_best = grouped_candidates[document_id][0]
        if is_candidate_document_relevant(
            best_score, document_best[1], document_best[2], document_best[0], keywords,
        ):
            relevant_document_ids.append(document_id)
    per_document_limit = (
        ASK_MAX_CONTEXT_CHUNKS
        if len(relevant_document_ids) == 1
        else ASK_CHUNKS_PER_DOCUMENT
    )
    for document_id in relevant_document_ids:
        selected_candidates.extend(grouped_candidates[document_id][:per_document_limit])
    selected_keys = {
        document_dedupe_key(document)
        for document, _score, _rank in selected_candidates
    }
    for candidate in unique_candidates:
        document = candidate[0]
        document_id = document_identity(document)
        if len(selected_candidates) >= ASK_MAX_CONTEXT_CHUNKS:
            break
        if document_id not in relevant_document_ids:
            continue
        if document_dedupe_key(document) in selected_keys:
            continue
        selected_candidates.append(candidate)
        selected_keys.add(document_dedupe_key(document))
    selected_candidates.sort(key=lambda candidate: candidate[2])
    return [
        document for document, _score, _rank in selected_candidates[:ASK_MAX_CONTEXT_CHUNKS]
    ]


def format_context(documents, max_chars=7000):
    context_parts = []
    remaining = max_chars
    for doc in documents:
        filename = document_display_name(doc)
        page = doc.metadata.get("page")
        source_label = f"{filename}, page {page + 1}" if isinstance(page, int) else filename
        content = doc.page_content.strip()
        if not content:
            continue
        block = f"Document: {source_label}\nContent:\n{content}"
        if len(block) > remaining:
            block = block[:remaining].rsplit(" ", 1)[0]
        context_parts.append(block)
        remaining -= len(block)
        if remaining <= 0:
            break
    return "\n\n".join(context_parts)


def collect_index_documents(vectorstore):
    docstore = getattr(vectorstore, "docstore", None)
    stored_docs = getattr(docstore, "_dict", {}) if docstore else {}
    return list(stored_docs.values())


def documents_for_upload(all_documents, document_id):
    return [
        doc for doc in all_documents
        if doc.metadata.get("document_id") == document_id
    ]


HF_GENERATION_MODEL = os.getenv("HF_GENERATION_MODEL", "google/flan-t5-base")
generation_tokenizer = None
generation_model = None
generation_is_encoder_decoder = False

embedding_model = HuggingFaceEmbeddings(
    model_name="sentence-transformers/all-MiniLM-L6-v2"
)


def load_generation_model():
    global generation_tokenizer, generation_model, generation_is_encoder_decoder
    if generation_model is not None and generation_tokenizer is not None:
        return generation_tokenizer, generation_model, generation_is_encoder_decoder

    logger.info("Acquiring model load lock")

    with model_load_lock:
        if generation_model is not None and generation_tokenizer is not None:
            return generation_tokenizer, generation_model, generation_is_encoder_decoder

        logger.info(
            "Loading generation model model=%s",
            HF_GENERATION_MODEL,
        )

        config = AutoConfig.from_pretrained(HF_GENERATION_MODEL)
        generation_is_encoder_decoder = bool(getattr(config, "is_encoder_decoder", False))
        generation_tokenizer = AutoTokenizer.from_pretrained(HF_GENERATION_MODEL)

        if generation_is_encoder_decoder:
            generation_model = AutoModelForSeq2SeqLM.from_pretrained(HF_GENERATION_MODEL)
        else:
            generation_model = AutoModelForCausalLM.from_pretrained(HF_GENERATION_MODEL)

        if torch.cuda.is_available():
            generation_model = generation_model.to("cuda")

        generation_model.eval()
        logger.info("Generation model loaded successfully")

    return generation_tokenizer, generation_model, generation_is_encoder_decoder


def generate_response(prompt: str, max_new_tokens: int) -> str:
    tokenizer, model, is_encoder_decoder = load_generation_model()
    model_device = next(model.parameters()).device

    # Tokenize and move to device before acquiring the lock so
    # CPU-bound preprocessing does not block other threads unnecessarily.
    encoded = tokenizer(prompt, return_tensors="pt", truncation=True, max_length=2048)
    encoded = {key: value.to(model_device) for key, value in encoded.items()}
    pad_token_id = (
        tokenizer.pad_token_id
        if tokenizer.pad_token_id is not None
        else tokenizer.eos_token_id
    )

    # Only the model.generate() call is locked — tokenization and device
    # transfer above happen in parallel across threads. The lock purely
    # serialises the GPU/CPU forward pass itself which is not thread-safe.
    logger.debug("Acquiring generation lock")
    with generation_lock:
        with torch.no_grad():
            generated_ids = model.generate(
                **encoded,
                max_new_tokens=max_new_tokens,
                do_sample=False,
                pad_token_id=pad_token_id,
            )
    logger.debug("Generation completed")

    if is_encoder_decoder:
        text = tokenizer.decode(generated_ids[0], skip_special_tokens=True)
        return text.strip()
    input_len = encoded["input_ids"].shape[1]
    new_tokens = generated_ids[0][input_len:]
    text = tokenizer.decode(new_tokens, skip_special_tokens=True)
    return text.strip()


def sanitize_upload_filename(client_file_path: str) -> str:
    if not client_file_path or not client_file_path.strip():
        raise ValueError("Missing PDF file path.")
    stripped_path = client_file_path.strip()
    normalized_path = stripped_path.replace("\\", "/")
    safe_name = normalized_path.rsplit("/", 1)[-1].strip()
    if not safe_name:
        raise ValueError("Missing PDF file path.")
    if safe_name in {".", ".."} or ".." in safe_name:
        raise ValueError("Invalid upload filename.")
    if "/" in safe_name or "\\" in safe_name:
        raise ValueError("Invalid upload filename.")
    if any(character not in UPLOAD_FILENAME_CHARS for character in safe_name):
        raise ValueError("Uploaded filename contains unsupported characters.")
    if not safe_name.lower().endswith(".pdf"):
        raise ValueError("Only PDF files are allowed.")
    return safe_name


def get_trusted_upload_path(file_name: str) -> str:
    trusted_path = os.path.join(str(UPLOADS_DIR), file_name)
    normalized_uploads_dir = os.path.abspath(str(UPLOADS_DIR))
    normalized_path = os.path.abspath(trusted_path)
    if os.path.dirname(normalized_path) != normalized_uploads_dir:
        raise ValueError("Invalid upload path.")
    return normalized_path


def validate_uploaded_pdf(file_path: str) -> str:
    trusted_path = os.fspath(file_path)
    if not trusted_path.lower().endswith(".pdf"):
        raise ValueError("Only PDF files are allowed.")
    # CodeQL [py/path-injection]: trusted server-constructed upload path
    if not os.path.isfile(trusted_path):
        raise ValueError("File does not exist or is not a valid file.")
    # CodeQL [py/path-injection]: trusted server-constructed upload path
    if os.path.getsize(trusted_path) == 0:
        raise ValueError("Uploaded PDF is empty. Please choose a valid PDF file.")
    return trusted_path


class Question(BaseModel):
    question: str = Field(..., min_length=1, description="Question cannot be empty")
    session_id: UUID

    @field_validator("question")
    @classmethod
    def question_must_not_be_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Question cannot be whitespace only")
        return v


class SummarizeRequest(BaseModel):
    pdf: str | None = None
    session_id: UUID


@app.post("/process-pdf")
def process_pdf(
    file: UploadFile = File(...),
    session_id: str | None = Form(None)
):
    cleanup_expired_sessions()

    filename = file.filename or "uploaded.pdf"
    if not filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF documents are supported.")
    requested_session_id = (session_id or "").strip() or None

    # ─── Quota pre-flight checks ──────────────────────────────────────────────────
    if requested_session_id:
        with sessions_lock:
            session = _peek_session_unlocked(requested_session_id)
            if not session:
                raise HTTPException(status_code=404, detail="Session expired or invalid. Please re-upload your PDFs.")
            if len(session.get("documents", [])) >= MAX_DOCUMENTS_PER_SESSION:
                raise HTTPException(status_code=400, detail="Maximum number of documents per session reached.")

    logger.info(
        "Processing PDF filename=%s existing_session=%s",
        filename,
        bool(requested_session_id),
    )

    os.makedirs(str(UPLOADS_DIR), exist_ok=True)
    temp_filename = f"temp_{uuid.uuid4().hex}.pdf"
    temp_path = os.path.join(str(UPLOADS_DIR), temp_filename)

    try:
        # Validate actual file magic bytes — extension alone is trivially bypassable.
        # A valid PDF always begins with the 4-byte signature: %PDF (0x25 0x50 0x44 0x46).
        magic = file.file.read(5)
        if magic[:4] != b"%PDF":
            raise HTTPException(
                status_code=415,
                detail="Invalid file type. Only real PDF documents are accepted."
            )
        file.file.seek(0)  # Reset stream so we can copy the full file

        max_size = 20 * 1024 * 1024
        bytes_written = 0
        with open(temp_path, "wb") as f:
            while chunk := file.file.read(65536):
                bytes_written += len(chunk)
                if bytes_written > max_size:
                    raise HTTPException(status_code=413, detail="Uploaded PDF exceeds the maximum size of 20MB.")
                f.write(chunk)

        if bytes_written == 0:
            raise HTTPException(status_code=400, detail="Uploaded PDF is empty. Please choose a valid PDF file.")

        try:
            docs = extract_pdf_documents_sandboxed(temp_path, filename)
        except Exception as exc:
            logger.warning("Failed to load PDF filename=%s error=%s", filename, exc)
            if isinstance(exc, HTTPException):
                raise
            raise HTTPException(status_code=400, detail="Unable to read this PDF. It may be corrupted or encrypted.")
    finally:
        file.file.close()
        if os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except Exception as e:
                logger.error("Failed to delete temp file %s: %s", temp_path, e)

    if not docs:
        raise HTTPException(status_code=400, detail="No readable pages were found in the PDF.")

    splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=100)
    chunks = splitter.split_documents(docs)
    unique_chunks = []
    seen_content = set()

    for chunk in chunks:
        content = chunk.page_content.strip()
        if content not in seen_content:
            seen_content.add(content)
            unique_chunks.append(chunk)

    chunks = unique_chunks

    if not chunks:
        raise HTTPException(status_code=400, detail="No text chunks generated from the PDF. Please check your file.")
    if not requested_session_id and len(chunks) > MAX_CHUNKS_PER_SESSION:
        raise HTTPException(
            status_code=400,
            detail=(
                f"PDF is too large to index. "
                f"A single document may not exceed {MAX_CHUNKS_PER_SESSION} chunks."
            ),
        )
    if requested_session_id:
        with sessions_lock:
            session = _peek_session_unlocked(requested_session_id)
            if session:
                current_chunks = sum(doc.get("chunk_count", 0) for doc in session.get("documents", []))
                if current_chunks + len(chunks) > MAX_CHUNKS_PER_SESSION:
                    raise HTTPException(status_code=400, detail="Maximum number of chunks per session exceeded.")
    else:
        if len(chunks) > MAX_CHUNKS_PER_SESSION:
            raise HTTPException(
                status_code=400,
                detail=f"PDF is too large to index. A single document may not exceed {MAX_CHUNKS_PER_SESSION} chunks.",
            )

    document_id = str(uuid.uuid4())
    temp_tracking_id = requested_session_id or str(uuid.uuid4())

    update_processing_progress(
        temp_tracking_id,
        "Extracting text from PDF",
        15
    )
    now = now_ts()
    uploaded_document = {
        "document_id": document_id,
        "filename": filename,
        "uploaded_at": now,
        "chunk_count": len(chunks),
    }

    for chunk_index, chunk in enumerate(chunks):
        chunk.metadata.update(
            {
                "document_id": document_id,
                "filename": filename,
                "chunk_index": chunk_index,
                "uploaded_at": now,
            }
        )

    try:
        new_vectorstore = FAISS.from_documents(chunks, embedding_model)
    except Exception as exc:
        logger.exception("Failed to create vectorstore filename=%s", filename)
        raise HTTPException(status_code=500, detail="Failed to index the uploaded PDF.")

    with sessions_lock:
        if requested_session_id:
            session = _touch_session_unlocked(requested_session_id)
            if not session:
                raise HTTPException(status_code=404, detail="Session expired or invalid. Please re-upload your PDFs.")
            session.setdefault("retrieval_cache", {})
            if "lock" not in session:
                session["lock"] = threading.Lock()
            session_lock = session["lock"]
            vectorstore = session["vectorstore"]
        else:
            _cleanup_expired_sessions_unlocked()
            _enforce_max_sessions_unlocked()
            session_id = str(uuid.uuid4())
            temp_tracking_id = session_id
            session_lock = threading.Lock()
            sessions[session_id] = {
                "vectorstore": new_vectorstore,
                "lock": session_lock,
                "documents": [uploaded_document],
                "created_at": now,
                "last_accessed": now,
                "retrieval_cache": {},
            }
            logger.info(
                "Created session session_id=%s filename=%s chunks=%s",
                session_id,
                filename,
                len(chunks),
            )

    if requested_session_id:
        with session_lock:
            try:
                vectorstore.merge_from(new_vectorstore)
            except Exception:
                logger.exception(
                    "Failed to merge vectorstore session_id=%s filename=%s",
                    requested_session_id,
                    filename,
                )
                raise HTTPException(status_code=500, detail="Failed to merge the uploaded PDF into this session.")
        with sessions_lock:
            session = _touch_session_unlocked(requested_session_id)
            if not session:
                raise HTTPException(status_code=404, detail="Session expired or invalid. Please re-upload your PDFs.")
            session.setdefault("documents", []).append(uploaded_document)
            session["last_accessed"] = now
            session["retrieval_cache"] = {}
            session_id = requested_session_id
            logger.info(
                "Merged PDF into session session_id=%s filename=%s documents=%s chunks=%s",
                session_id,
                filename,
                len(session["documents"]),
                len(chunks),
            )

    with sessions_lock:
        documents = list(sessions[session_id].get("documents", []))
    update_processing_progress(
        session_id,
        "Completed",
        100
    )
    return {
        "message": "PDF processed successfully",
        "session_id": session_id,
        "document": uploaded_document,
        "documents": documents,
    }




@app.get("/processing-status/{session_id}")
def processing_status(session_id: str):

    progress = processing_progress.get(session_id)

    if not progress:
        raise HTTPException(
            status_code=404,
            detail="No processing status found."
        )

    return progress


@app.post("/ask")
def ask_question(data: Question):
    cleanup_expired_sessions()

    question = (data.question or "").strip()

    if not question:
        raise HTTPException(
            status_code=400,
            detail="Question is required."
        )

    intent = detect_question_intent(question)
    session_id = str(data.session_id)

    # Normalize query for cache reuse
    normalized_query = normalize_query(question)
    

    with sessions_lock:

        session = _touch_session_unlocked(session_id)

        if not session or not session.get("vectorstore"):
            raise HTTPException(
                status_code=404,
                detail="Session expired or invalid. Please re-upload your PDFs."
            )

        if "lock" not in session:
            session["lock"] = threading.Lock()

        session_lock = session["lock"]
        vectorstore = session["vectorstore"]

        retrieval_cache = session.setdefault("retrieval_cache", {})

        if normalized_query in retrieval_cache:

            logger.info(
                "Retrieval cache hit session_id=%s",
                session_id
            )

            cached_result = retrieval_cache[normalized_query]

            return {
                **cached_result,
            
            }

        logger.info(
            "Retrieval cache miss session_id=%s",
            session_id
        )
    try:
        with session_lock:
            indexed_documents = collect_index_documents(vectorstore)
            scored_candidates = search_retrieval_candidates(
                vectorstore,
                question,
                ASK_RETRIEVAL_CANDIDATES,
            )

    except Exception:
        logger.exception("Similarity search failed session_id=%s", session_id)
        raise HTTPException(status_code=500, detail="Failed to search the uploaded documents.")

    docs = (
        representative_documents_by_source(indexed_documents)
        if intent == "overview"
        else diversify_retrieved_documents(
            scored_candidates,
            question
        )
    )

    best_score = scored_candidates[0][1] if scored_candidates else None
    if not passes_evidence_gate(question, docs, best_score, intent):
        logger.info(
            "Evidence gate refused answer session_id=%s intent=%s best_score=%s retrieved_chunks=%s",
            session_id,
            intent,
            best_score,
            len(docs),
        )
        return {
            "answer": INSUFFICIENT_CONTEXT_MESSAGE,
            "sources": [],
            "retrieval_type": "refusal",
        }

    pages = sorted(set(
        doc.metadata["page"] + 1
        for doc in docs
        if "page" in doc.metadata
    ))

    formatted_context = ""

    for idx, doc in enumerate(docs):

        page = (
            doc.metadata.get("page", 0) + 1
            if "page" in doc.metadata
            else None
        )

        formatted_context += (
            f"[Source {idx+1} | Page {page}]\n"
            f"{doc.page_content}\n\n"
        )

    context = formatted_context[:6500]

    retrieved_sources = sorted({
        document_display_name(doc)
        for doc in docs
    })

    citation_sources = []

    for idx, doc in enumerate(docs):

        citation_sources.append({
            "source_id": idx + 1,
            "document": document_display_name(doc),
            "page": (
                doc.metadata.get("page", 0) + 1
                if "page" in doc.metadata
                else None
            ),
            "preview": concise_excerpt(
                doc.page_content,
                180
            ),
        })

    source_id_by_key = {
        document_dedupe_key(doc): idx + 1
        for idx, doc in enumerate(docs)
    }

    grounded_answer = build_answer_from_documents(
        question,
        docs,
        intent,
        source_id_by_key=source_id_by_key,
    )

    if grounded_answer == INSUFFICIENT_CONTEXT_MESSAGE:
        logger.info(
            "Refusing due to insufficient context session_id=%s intent=%s best_score=%s retrieved_chunks=%s sources=%s",
            session_id,
            intent,
            best_score,
            len(docs),
            retrieved_sources,
        )
        return {
            "answer": grounded_answer,
            "sources": citation_sources,
            "retrieval_type": "refusal",
        }

    if grounded_answer:
        if ASK_REQUIRE_CITATIONS and not answer_contains_citation(grounded_answer, len(docs)):
            logger.info(
                "Refusing due to missing citations session_id=%s intent=%s best_score=%s retrieved_chunks=%s sources=%s",
                session_id,
                intent,
                best_score,
                len(docs),
                retrieved_sources,
            )
            return {
                "answer": INSUFFICIENT_CONTEXT_MESSAGE,
                "sources": citation_sources,
                "retrieval_type": "refusal",
            }
        logger.info(
            "Returning grounded answer session_id=%s intent=%s retrieved_chunks=%s sources=%s",
            session_id,
            intent,
            len(docs),
            retrieved_sources,
        )

        return {
            "answer": grounded_answer,
            "sources": citation_sources,
            "retrieval_type": "citation-aware",
            
        }

    prompt = (
        "You are a careful assistant answering questions over one or more uploaded PDF documents. "
        "Use only the provided context. The context may include excerpts from multiple PDFs. "
        "When the question asks for a relationship, comparison, or synthesis, connect the relevant facts across documents. "
        "If the context does not contain enough information, say that briefly and do not invent details.\n\n"

        "Reference the provided source numbers naturally whenever the answer is directly supported by the context.\n"
        "Cite sources using formats like 'According to Source 1' or 'Source 2 explains that...'\n"

        "You are a helpful AI assistant.\n"
        "Give clear, conversational, human-friendly answers.\n"
        "Do not return raw PDF text or chunks.\n"
        "Summarize properly in readable sentences.\n\n"

        f"Context:\n{context}\n\n"
        f"Question: {question}\n"
        "Answer:"
    )

    logger.info(
        "Executing query session_id=%s retrieved_chunks=%s sources=%s",
        session_id,
        len(docs),
        retrieved_sources,
    )

    answer = generate_response(
        prompt,
        max_new_tokens=256
    )

    response_payload = {
        "answer": answer,
        "sources": citation_sources,
        "retrieval_type": "citation-aware",
        
    }

    with sessions_lock:

        session = sessions.get(session_id)

        if session:

            retrieval_cache = session.setdefault(
                "retrieval_cache",
                {}
            )

            retrieval_cache[normalized_query] = {
                "answer": answer,
                "sources": citation_sources,
                "retrieval_type": "citation-aware",
            }

    return response_payload

@app.post("/summarize")
def summarize_pdf(data: SummarizeRequest):
    cleanup_expired_sessions()
    session_id = str(data.session_id)
    with sessions_lock:
        session = _touch_session_unlocked(session_id)
        if not session or not session.get("vectorstore"):
            raise HTTPException(status_code=404, detail="Session expired or invalid. Please re-upload your PDFs.")
        if "lock" not in session:
            session["lock"] = threading.Lock()
        session_lock = session["lock"]
        vectorstore = session["vectorstore"]
        uploaded_documents = list(session.get("documents", []))

    with session_lock:
        indexed_documents = collect_index_documents(vectorstore)

    if not uploaded_documents or not indexed_documents:
        return {"summary": "No document context available to summarize."}

    logger.info(
        "Summarizing session session_id=%s documents=%s",
        session_id,
        len(uploaded_documents),
    )

    return {"summary": build_session_summary(uploaded_documents, indexed_documents)}

if __name__ == "__main__":
    is_production = os.getenv("ENVIRONMENT", "development").lower() == "production"
    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", "5000"))
    uvicorn.run("main:app", host=host, port=port, reload=not is_production)
