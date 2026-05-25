from fastapi import FastAPI, Request, HTTPException, File, UploadFile, Form
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.exceptions import RequestValidationError
from pydantic import BaseModel, Field, field_validator
from pathlib import Path
from uuid import UUID
from contextlib import contextmanager
from langchain_community.vectorstores import FAISS
from langchain_community.embeddings import HuggingFaceEmbeddings
from dotenv import load_dotenv
from rank_bm25 import BM25Okapi
from pdf_parse_worker import _extract_pdf_text_worker
from langchain_community.vectorstores import FAISS
import numpy as np
import json
import uuid
import uvicorn
import torch
import multiprocessing
import os
import secrets
import shutil
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
from collections import OrderedDict
try:  # pragma: no cover
    import fcntl  # type: ignore
except Exception:  # pragma: no cover
    fcntl = None

try:  # pragma: no cover
    import msvcrt  # type: ignore
except Exception:  # pragma: no cover
    msvcrt = None

load_dotenv()

# ── Logger (must be defined before exception handlers that use it) ─────────────
logger = logging.getLogger("pdf_qa_rag")
logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)

app = FastAPI()

BASE_DIR = Path(__file__).resolve().parent.parent
UPLOADS_DIR = (BASE_DIR / "uploads").resolve()
DATA_DIR = (BASE_DIR / "rag-service" / "data").resolve()
FAISS_DIR = DATA_DIR / "faiss"
SESSIONS_FILE = DATA_DIR / "sessions.json"
PERSIST_PATH = DATA_DIR
SESSION_REGISTRY_FILE = PERSIST_PATH / "session_registry.json"
SESSION_REGISTRY_LOCK_FILE = PERSIST_PATH / "session_registry.lock"

os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(FAISS_DIR, exist_ok=True)

def load_sessions():
    if SESSIONS_FILE.exists():
        try:
            with open(SESSIONS_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
                for sid, meta in data.items():
                    meta["lock"] = threading.Lock()
                    meta["vectorstore"] = None
                return data
        except Exception as e:
            logger.error(f"Failed to load sessions: {e}")
    return {}

def save_sessions_unlocked():
    try:
        data = {}

        for sid, meta in sessions.items():

            safe_cache = {}

            for key, value in meta.get("retrieval_cache", {}).items():
                if isinstance(value, dict):
                    safe_cache[key] = value

            data[sid] = {
                "created_at": meta.get("created_at"),
                "last_accessed": meta.get("last_accessed"),
                "documents": meta.get("documents", []),
                "retrieval_cache": safe_cache,
                "chat": meta.get("chat", []),
                "session_secret": meta.get("session_secret"),
            }

        with open(SESSIONS_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f)

    except Exception as e:
        logger.error(f"Failed to save sessions: {e}")

# Global session store
sessions = load_sessions()
processing_progress = {}
def update_processing_progress(session_id, stage, progress):
    payload = {
        "stage": stage,
        "progress": progress,
        "updated_at": now_ts(),
    }

    processing_progress[session_id] = payload

    with sessions_lock:
        meta = sessions.get(session_id)
        if meta:
            meta["processing_progress"] = payload

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


def generate_session_secret() -> str:
    return secrets.token_urlsafe(32)


def standard_error_response(status_code: int, detail: str, **extra):
    payload = {
        "error": detail,
        "detail": detail,
        **extra,
    }
    return JSONResponse(status_code=status_code, content=payload)

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

    Protection is applied via two mechanisms:
      1. Exact-match set — covers named endpoints that must never be publicly reachable.
      2. Prefix set — covers entire sub-trees so that any future sub-route (e.g.
         /ask/v2/stream) is automatically protected without requiring a code change here.
    """
    protected_paths = {
        "/process-pdf",
        "/ask",
        "/ask/stream",
        "/summarize",
        "/validate-session-write",
        "/sessions/lookup",
    }

    # Prefix-based guard: any sub-path under these trees is also protected.
    # This ensures that adding a new streaming variant or versioned route can
    # never silently bypass auth because a developer forgot to update the set above.
    protected_prefixes = (
        "/ask/",
        "/processing-status/",
    )

    path = request.url.path

    if INTERNAL_RAG_TOKEN and (
        path in protected_paths
        or any(path.startswith(prefix) for prefix in protected_prefixes)
    ):
        provided = request.headers.get("X-Internal-Token")
        if not internal_token_valid(provided, INTERNAL_RAG_TOKEN):
            logger.warning(
                "Internal auth rejected path=%s ip=%s",
                path,
                request.client.host if request.client else "unknown",
            )
            return standard_error_response(403, "Forbidden")

    return await call_next(request)


@app.get("/health")
def health_check():
    return {"status": "ok"}


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
SESSION_TTL_MINUTES = int(os.getenv("SESSION_TTL_MINUTES", "43200"))  # 30 days default for persistence
MAX_ACTIVE_SESSIONS = int(os.getenv("MAX_ACTIVE_SESSIONS", "1000"))
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
RETRIEVAL_CACHE_LIMIT = int(os.getenv("RETRIEVAL_CACHE_LIMIT", "25"))
RETRIEVAL_CACHE_TTL_SECONDS = int(
    os.getenv("RETRIEVAL_CACHE_TTL_SECONDS", "1800")
)

# ── Semantic Chunking Config ─────────────────────────────────────────────────
SEMANTIC_CHUNK_SOFT_MAX = int(os.getenv("SEMANTIC_CHUNK_SOFT_MAX", "1200"))
SEMANTIC_CHUNK_MERGE_MIN = int(os.getenv("SEMANTIC_CHUNK_MERGE_MIN", "150"))
SEMANTIC_CHUNK_MERGE_MAX = int(os.getenv("SEMANTIC_CHUNK_MERGE_MAX", "1400"))
SEMANTIC_CHUNK_SIMILARITY_THRESHOLD = float(
    os.getenv("SEMANTIC_CHUNK_SIMILARITY_THRESHOLD", "0.75")
)
SEMANTIC_CHUNK_MERGE_WARN_SECS = float(
    os.getenv("SEMANTIC_CHUNK_MERGE_WARN_SECS", "5.0")
)
SEMANTIC_CHUNK_HIERARCHICAL = os.getenv(
    "SEMANTIC_CHUNK_HIERARCHICAL", "true"
).strip().lower() in {"1", "true", "yes", "on"}
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

def cleanup_retrieval_cache(retrieval_cache):
    expired_keys = []

    current_time = now_ts()

    for key, value in retrieval_cache.items():

        if not isinstance(value, dict):
            expired_keys.append(key)
            continue

        cached_at = value.get("cached_at")

        if not cached_at:
            expired_keys.append(key)
            continue

        age = current_time - cached_at

        if age > RETRIEVAL_CACHE_TTL_SECONDS:
            expired_keys.append(key)

    for key in expired_keys:
        retrieval_cache.pop(key, None)

    if expired_keys:
        logger.info(
            "Retrieval cache cleanup removed=%s remaining=%s",
            len(expired_keys),
            len(retrieval_cache),
        )

def session_expires_at(last_accessed: float) -> float:
    return last_accessed + (SESSION_TTL_MINUTES * 60)


def normalize_session_id(session_id: str) -> str:
    if not session_id or not str(session_id).strip():
        raise ValueError("Missing session id.")
    return str(UUID(str(session_id).strip()))


def get_session_dir(session_id: str) -> str:
    safe_session_id = normalize_session_id(session_id)
    return os.fspath(PERSIST_PATH / safe_session_id)


@contextmanager
def session_store_lock(session_id: str):
    safe_session_id = normalize_session_id(session_id)
    PERSIST_PATH.mkdir(parents=True, exist_ok=True)
    lock_path = PERSIST_PATH / f"{safe_session_id}.lock"
    with open(lock_path, "a+b") as lock_file:
        if fcntl:
            fcntl.flock(lock_file.fileno(), fcntl.LOCK_EX)
        elif msvcrt:
            lock_file.seek(0)
            lock_file.write(b"0")
            lock_file.flush()
            lock_file.seek(0)
            msvcrt.locking(lock_file.fileno(), msvcrt.LK_LOCK, 1)
        try:
            yield
        finally:
            if fcntl:
                fcntl.flock(lock_file.fileno(), fcntl.LOCK_UN)
            elif msvcrt:
                lock_file.seek(0)
                msvcrt.locking(lock_file.fileno(), msvcrt.LK_UNLCK, 1)


@contextmanager
def session_registry_lock():
    PERSIST_PATH.mkdir(parents=True, exist_ok=True)
    with open(SESSION_REGISTRY_LOCK_FILE, "a+b") as lock_file:
        if fcntl:
            fcntl.flock(lock_file.fileno(), fcntl.LOCK_EX)
        elif msvcrt:
            lock_file.seek(0)
            lock_file.write(b"0")
            lock_file.flush()
            lock_file.seek(0)
            msvcrt.locking(lock_file.fileno(), msvcrt.LK_LOCK, 1)
        try:
            yield
        finally:
            if fcntl:
                fcntl.flock(lock_file.fileno(), fcntl.LOCK_UN)
            elif msvcrt:
                lock_file.seek(0)
                msvcrt.locking(lock_file.fileno(), msvcrt.LK_UNLCK, 1)


def read_session_registry_unlocked() -> dict:
    if not SESSION_REGISTRY_FILE.exists():
        return {}
    try:
        with open(SESSION_REGISTRY_FILE, "r", encoding="utf-8") as registry_file:
            registry = json.load(registry_file)
            return registry if isinstance(registry, dict) else {}
    except Exception:
        logger.exception("Failed to read session registry")
        return {}


def read_session_registry() -> dict:
    with session_registry_lock():
        return read_session_registry_unlocked()


def write_session_registry_unlocked(registry: dict):
    PERSIST_PATH.mkdir(parents=True, exist_ok=True)
    temp_path = SESSION_REGISTRY_FILE.with_suffix(".tmp")
    with open(temp_path, "w", encoding="utf-8") as registry_file:
        json.dump(registry, registry_file, separators=(",", ":"), sort_keys=True)
    os.replace(temp_path, SESSION_REGISTRY_FILE)


def write_session_registry(registry: dict):
    with session_registry_lock():
        write_session_registry_unlocked(registry)


def persist_session_registry_entry(session_id: str, meta: dict):
    with session_registry_lock():
        registry = read_session_registry_unlocked()
        last_accessed = meta.get("last_accessed", now_ts())
        session_dir = get_session_dir(session_id)
        registry[session_id] = {
            "created_at": meta.get("created_at", last_accessed),
            "last_accessed": last_accessed,
            "expires_at": session_expires_at(last_accessed),
            "documents": list(meta.get("documents", [])),
            "session_dir": session_dir,
            "session_secret": meta.get("session_secret"),
        }
        write_session_registry_unlocked(registry)


def remove_persisted_session(session_id: str, session_dir: str | None = None):
    with session_registry_lock():
        registry = read_session_registry_unlocked()
        registry_entry = registry.pop(session_id, None)
        write_session_registry_unlocked(registry)

    try:
        target_path = Path(get_session_dir(session_id)).resolve()
        if target_path.is_dir() and PERSIST_PATH in target_path.parents:
            shutil.rmtree(target_path)
    except Exception:
        logger.exception("Failed to remove persisted session session_id=%s", session_id)


def cleanup_expired_persisted_sessions(extra_session_dirs: dict | None = None):
    now = now_ts()
    expired_dirs = {}
    with session_registry_lock():
        registry = read_session_registry_unlocked()
        expired_ids = [
            sid
            for sid, entry in registry.items()
            if now > float(entry.get("expires_at", 0) or 0)
        ]
        for sid in extra_session_dirs or {}:
            if sid not in expired_ids:
                expired_ids.append(sid)

        for sid in expired_ids:
            expired_dirs[sid] = get_session_dir(sid)
            registry.pop(sid, None)

        if expired_ids:
            write_session_registry_unlocked(registry)

    for sid, session_dir in expired_dirs.items():
        try:
            target_path = Path(get_session_dir(sid)).resolve()
            if target_path.is_dir() and PERSIST_PATH in target_path.parents:
                shutil.rmtree(target_path)
        except Exception:
            logger.exception("Failed to remove persisted session session_id=%s", sid)


def persist_vectorstore(session_id: str, vectorstore):
    session_dir = get_session_dir(session_id)
    os.makedirs(session_dir, exist_ok=True)
    vectorstore.save_local(session_dir)
    return session_dir


def _recover_session_unlocked(session_id: str):
    registry = read_session_registry()
    entry = registry.get(session_id)
    if not entry:
        return None

    last_accessed = float(entry.get("last_accessed", 0) or 0)
    if now_ts() > float(entry.get("expires_at", session_expires_at(last_accessed))):
        remove_persisted_session(session_id, entry.get("session_dir"))
        return None

    session_dir = get_session_dir(session_id)
    if not os.path.isdir(session_dir):
        remove_persisted_session(session_id, session_dir)
        return None

    try:
        vectorstore = FAISS.load_local(
            session_dir,
            get_embedding_model(),
            allow_dangerous_deserialization=True,
        )
    except Exception:
        logger.exception("Failed to recover persisted session session_id=%s", session_id)
        return None

    meta = {
        "vectorstore": vectorstore,
        "lock": threading.Lock(),
        "documents": list(entry.get("documents", [])),
        "session_secret": entry.get("session_secret"),
        "session_dir": session_dir,
        "created_at": float(entry.get("created_at", last_accessed) or last_accessed),
        "last_accessed": last_accessed,
    }
    sessions[session_id] = meta
    logger.info("Recovered persisted session session_id=%s", session_id)
    return meta

def cleanup_failed_session(session_id: str):
    """
    Best-effort rollback cleanup for partially created sessions.

    Used when PDF ingestion fails after placeholder session creation
    but before the session becomes fully usable.
    """
    try:
        with sessions_lock:
            session = sessions.pop(session_id, None)

            if session_id in processing_progress:
                processing_progress.pop(session_id, None)

        try:
            remove_persisted_session(session_id)
        except Exception:
            logger.exception(
                "Failed to remove persisted session registry entry session_id=%s",
                session_id,
            )

        if session:
            session_dir = session.get("session_dir")
            if session_dir and os.path.exists(session_dir):
                try:
                    shutil.rmtree(session_dir, ignore_errors=True)
                except Exception:
                    logger.exception(
                        "Failed to remove session directory session_id=%s path=%s",
                        session_id,
                        session_dir,
                    )

    except Exception:
        logger.exception(
            "Unexpected cleanup failure for partially created session session_id=%s",
            session_id,
        )
def cleanup_expired_sessions():
    """
    Remove expired sessions and enforce max session cap.
    """
    expired = []
    expired_dirs = {}
    evicted_count = 0
    active_sessions = 0
    with sessions_lock:
        ttl_seconds = SESSION_TTL_MINUTES * 60
        for sid, meta in list(sessions.items()):
            if now_ts() - meta["last_accessed"] > ttl_seconds:
                expired.append(sid)
                expired_dirs[sid] = meta.get("session_dir")
        for sid in expired:
            del sessions[sid]
        while len(sessions) > MAX_ACTIVE_SESSIONS:
            oldest = min(sessions.items(), key=lambda x: x[1]["created_at"])[0]
            expired_dirs[oldest] = sessions[oldest].get("session_dir")
            del sessions[oldest]
            expired.append(oldest)
            evicted_count += 1
        active_sessions = len(sessions)
        if expired or evicted_count:
            save_sessions_unlocked()
            cleanup_expired_persisted_sessions(expired_dirs)
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
        meta = _recover_session_unlocked(session_id)
        if not meta:
            return None
    # Hard-disable legacy sessions created before session secrets existed.
    # These are effectively "session_id-only" capabilities and must be invalidated
    # to avoid cross-user access.
    if not (meta.get("session_secret") or "").strip():
        session_dir = meta.get("session_dir")
        try:
            del sessions[session_id]
        except Exception:
            pass
        remove_persisted_session(session_id, session_dir)
        logger.info("Invalidated legacy session without secret session_id=%s", session_id)
        return None
    if _is_session_expired(meta):
        session_dir = meta.get("session_dir")
        del sessions[session_id]
        remove_persisted_session(session_id, session_dir)
        logger.info("Session expired session_id=%s", session_id)
        return None
    meta["last_accessed"] = now_ts()
    persist_session_registry_entry(session_id, meta)
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
        meta = _recover_session_unlocked(session_id)
        if not meta:
            return None
    if not (meta.get("session_secret") or "").strip():
        session_dir = meta.get("session_dir")
        try:
            del sessions[session_id]
        except Exception:
            pass
        remove_persisted_session(session_id, session_dir)
        logger.info("Invalidated legacy session without secret session_id=%s", session_id)
        return None
    if _is_session_expired(meta):
        session_dir = meta.get("session_dir")
        del sessions[session_id]
        remove_persisted_session(session_id, session_dir)
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
        session_dir = sessions[sid].get("session_dir")
        del sessions[sid]
        remove_persisted_session(sid, session_dir)
    if expired:
        logger.info("Expired sessions removed count=%s", len(expired))


def _enforce_max_sessions_unlocked():
    while len(sessions) >= MAX_ACTIVE_SESSIONS:
        oldest = min(sessions.items(), key=lambda x: x[1]["created_at"])[0]
        session_dir = sessions[oldest].get("session_dir")
        del sessions[oldest]
        remove_persisted_session(oldest, session_dir)
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


def _generate_followup_question(answer: str, question: str, docs: list) -> str:
    """Derive one non-yes/no follow-up from the answer text."""
    sentences = split_sentences(answer)
    base = sentences[0] if sentences else answer[:200]
    
    prompt = (
        "Given this answer from a document: "
        f'"{base}" '
        "Write one thoughtful follow-up question (not yes/no) that would deepen "
        "understanding of the topic. Question only, no preamble:"
    )
    try:
        return generate_response(prompt, max_new_tokens=60).strip()
    except Exception:
        return "What further implications does this have for the broader topic?"


def _generate_socratic_questions(question: str, docs: list) -> str:
    """Return 2-3 guiding questions without revealing the answer."""
    _SAFE_FALLBACK = (
        "🤔 Let's think through this together:\n\n"
        "1. What context does the document provide about this topic?\n"
        "2. What evidence does the document give that relates to your question?\n"
        "3. Based on that evidence, what conclusion can you draw?"
    )
    _INTERROGATIVES = {"what", "why", "how", "when", "where", "which", "who", "could", "can", "would", "is", "are", "do", "does"}

    context_preview = " ".join(
        doc.page_content[:200] for doc in docs[:3]
    )
    prompt = (
        "You are a Socratic tutor. The student asked: "
        f'"{question}". '
        "Based on this document context (DO NOT reveal the answer): "
        f"{context_preview[:600]} "
        "Write 2-3 guiding questions that lead the student toward discovering "
        "the answer themselves. Go from broad to specific. Never state the answer:"
    )
    try:
        raw = generate_response(prompt, max_new_tokens=120).strip()

        # Sanitize: keep only lines that look like genuine questions
        lines = [ln.strip() for ln in raw.splitlines()]
        question_lines = [
            ln for ln in lines
            if ln and (
                ln.endswith("?")
                or ln.split()[0].rstrip(".").lower() in _INTERROGATIVES
            )
        ]

        # Enforce 2–3 questions; fall back if we can't satisfy the constraint
        if len(question_lines) < 2:
            return _SAFE_FALLBACK
        question_lines = question_lines[:3]  # cap at 3

        formatted = "\n".join(
            f"{i + 1}. {q}" for i, q in enumerate(question_lines)
        )
        return f"🤔 Let's think through this together:\n\n{formatted}"
    except Exception:
        return _SAFE_FALLBACK


def _truncate_to_concise(answer: str, word_limit: int = 60) -> str:
    """Return first 1-2 sentences, hard-capped at word_limit words."""
    sentences = split_sentences(answer)
    if not sentences:
        return answer
    result = sentences[0]
    words = result.split()
    if len(words) > word_limit:
        result = " ".join(words[:word_limit]) + "…"
    return result


def apply_mode_framing(
    answer: str,
    question: str,
    mode: str,
    docs: list,
    context: str,
) -> str:
    """Transform the grounded answer according to the requested mode."""
    if mode == "default" or not mode:
        return answer

    if mode == "tutor":
        followup = _generate_followup_question(answer, question, docs)
        return f"{answer}\n\n---\n💡 To think about: {followup}"

    if mode == "socratic":
        return _generate_socratic_questions(question, docs)

    if mode == "eli5":
        prompt = (
            "Explain this simply. Use an analogy if helpful. "
            "Avoid technical jargon. Write short sentences. "
            "Assume the reader has no background in this topic. "
            "If a technical term is unavoidable, immediately explain it in "
            "plain language in parentheses. Use flowing prose, no bullet points.\n\n"
            f"Context:\n{context[:3000]}\n\n"
            f"Question: {question}\n"
            "Simple explanation:"
        )
        try:
            return generate_response(prompt, max_new_tokens=200).strip()
        except Exception:
            return answer

    if mode == "concise":
        truncated = _truncate_to_concise(answer)
        if not truncated.strip():
            return "The document doesn't state this directly."
        return truncated

    return answer


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
        # Pass 2b: prefer richer parent context for generation; fall back to page_content
        content = (doc.metadata.get("parent_chunk") or doc.page_content or "").strip()
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


def citation_source_for_document(document, index):
    page = document.metadata.get("page")
    display_page = page + 1 if isinstance(page, int) else None
    text = concise_excerpt(document.page_content, 250)

    return {
        "source_id": index + 1,
        "document": document_display_name(document) or "Unknown Document",
        "document_id": document.metadata.get("document_id"),
        "page": display_page,
        "text": text,
        "preview": concise_excerpt(document.page_content, 180),
        "chunk_index": document.metadata.get("chunk_index", index),
    }


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



embedding_model = None

def get_embedding_model():
    global embedding_model

    if embedding_model is not None and hasattr(embedding_model, "embed_documents"):
        return embedding_model

    with model_load_lock:
        if embedding_model is None or not hasattr(embedding_model, "embed_documents"):
            logger.info("Loading embedding model")

            embedding_model = HuggingFaceEmbeddings(
                model_name="sentence-transformers/all-MiniLM-L6-v2"
            )

            if embedding_model is None or not hasattr(embedding_model, "embed_documents"):
                raise RuntimeError("Embedding model failed to initialize.")

            logger.info("Embedding model loaded successfully")

    return embedding_model


# ─────────────────────────────────────────────────────────────────────────────
# Semantic Chunking Pipeline
# ─────────────────────────────────────────────────────────────────────────────

# ── Cosine similarity (numpy, no extra deps) ──────────────────────────────────

def _cosine_similarity(vec_a: list, vec_b: list) -> float:
    """Cosine similarity between two embedding vectors; safe for zero norms."""
    a = np.array(vec_a, dtype=np.float32)
    b = np.array(vec_b, dtype=np.float32)
    norm_a = np.linalg.norm(a)
    norm_b = np.linalg.norm(b)
    if norm_a == 0.0 or norm_b == 0.0:
        return 0.0
    return float(np.dot(a, b) / (norm_a * norm_b))


# ── Pass 1: boundary-aware splitting ─────────────────────────────────────────

_HEADING_RE = re.compile(
    r"(?m)"
    r"(?:^#{1,3} .+$"
    r"|.+:\s*$)"
)


def _split_pass1(text: str, soft_max: int) -> list:
    """
    Boundary-aware split in priority order:
      1. Double-newline paragraph breaks
      2. Markdown headings / lines ending in colon
      3. Sentence terminals (. ? !)
      4. Hard word-boundary split as last resort (never mid-word)

    Returns a list of non-empty stripped strings.
    Crash-safe: empty or whitespace-only text returns [].
    """
    if not text or not text.strip():
        return []

    paragraphs = [p.strip() for p in re.split(r"\n{2,}", text) if p.strip()]

    chunks = []
    for para in paragraphs:
        if len(para) <= soft_max:
            if _HEADING_RE.match(para):
                chunks.append(para)
            else:
                if chunks and len(chunks[-1]) + len(para) + 1 <= soft_max:
                    chunks[-1] = chunks[-1] + "\n" + para
                else:
                    chunks.append(para)
        else:
            # Split large paragraph by heading boundaries first
            sub_parts = [s.strip() for s in _HEADING_RE.split(para) if s.strip()]
            for sub in sub_parts:
                if len(sub) <= soft_max:
                    chunks.append(sub)
                else:
                    # Sentence-level split
                    sentences = re.split(r"(?<=[.?!])\s+", sub)
                    current = ""
                    for sent in sentences:
                        sent = sent.strip()
                        if not sent:
                            continue
                        candidate = (current + " " + sent).strip()
                        if len(candidate) <= soft_max:
                            current = candidate
                        else:
                            if current:
                                chunks.append(current)
                            if len(sent) > soft_max:
                                # Hard word-boundary split — last resort
                                while sent:
                                    piece = sent[:soft_max]
                                    # Back up to last space so we don't cut mid-word
                                    if len(sent) > soft_max and " " in piece:
                                        piece = piece.rsplit(" ", 1)[0]
                                    chunks.append(piece)
                                    sent = sent[len(piece):].lstrip()
                            else:
                                current = sent
                    if current:
                        chunks.append(current)

    return [c for c in chunks if c.strip()]


# ── Pass 2: semantic merge of tiny adjacent chunks ────────────────────────────

def _split_pass2(
    raw_chunks: list,
    threshold: float,
    merge_min: int,
    merge_max: int,
) -> list:
    """
    Merge adjacent tiny chunks (< merge_min chars) when:
      - cosine similarity >= threshold, AND
      - merged length <= merge_max

    Only tiny chunks and their immediate neighbours are embedded,
    keeping latency proportional to fragment count, not total chunks.
    """
    if not raw_chunks:
        return []

    tiny_indices = [i for i, c in enumerate(raw_chunks) if len(c) < merge_min]
    if not tiny_indices:
        return list(raw_chunks)  # fast-path: nothing to merge

    # Collect tiny chunks + their immediate neighbours for batch embedding
    neighbour_indices = set()
    for idx in tiny_indices:
        neighbour_indices.add(idx)
        if idx > 0:
            neighbour_indices.add(idx - 1)
        if idx < len(raw_chunks) - 1:
            neighbour_indices.add(idx + 1)

    sorted_indices = sorted(neighbour_indices)
    texts_to_embed = [raw_chunks[i] for i in sorted_indices]

    try:
        emb_model = get_embedding_model()
        embeddings_list = emb_model.embed_documents(texts_to_embed)
    except Exception:
        logger.warning("Semantic merge embedding failed — skipping merge pass", exc_info=True)
        return list(raw_chunks)

    emb_map = {idx: emb for idx, emb in zip(sorted_indices, embeddings_list)}

    result = []
    i = 0
    while i < len(raw_chunks):
        chunk = raw_chunks[i]
        if len(chunk) >= merge_min:
            result.append(chunk)
            i += 1
            continue

        # Try to merge with next chunk
        if i + 1 < len(raw_chunks):
            next_chunk = raw_chunks[i + 1]
            merged_len = len(chunk) + len(next_chunk) + 1
            emb_a = emb_map.get(i)
            emb_b = emb_map.get(i + 1)
            if (
                emb_a is not None
                and emb_b is not None
                and merged_len <= merge_max
                and _cosine_similarity(emb_a, emb_b) >= threshold
            ):
                result.append((chunk + " " + next_chunk).strip())
                i += 2
                continue

        # Try to append to previous chunk
        if result:
            prev = result[-1]
            merged_len = len(prev) + len(chunk) + 1
            emb_a = emb_map.get(i - 1)
            emb_b = emb_map.get(i)
            if (
                emb_a is not None
                and emb_b is not None
                and merged_len <= merge_max
                and _cosine_similarity(emb_a, emb_b) >= threshold
            ):
                result[-1] = (prev + " " + chunk).strip()
                i += 1
                continue

        # Cannot merge — keep as orphan
        result.append(chunk)
        i += 1

    return [c for c in result if c.strip()]


# ── Pass 2b: parent context window ───────────────────────────────────────────

def _build_parent_context(chunks: list, idx: int, window: int = 1) -> str:
    """Return chunk at idx plus up to `window` neighbours on each side."""
    start = max(0, idx - window)
    end = min(len(chunks), idx + window + 1)
    return " ".join(chunks[start:end]).strip()


# ── Public entry point ────────────────────────────────────────────────────────

def semantic_chunk(text: str, filename: str, page_number: int, document_id: str) -> list:
    """
    Two-pass semantic chunker returning LangChain Document objects.

    Pass 1  — boundary-aware split (paragraph > heading > sentence > hard).
    Pass 2  — merge adjacent tiny chunks by embedding cosine similarity.
    Pass 2b — attach small_chunk + parent_chunk to each Document's metadata.

    Guaranteed crash-safe for empty / single-sentence pages (returns []).
    Metadata keys: document_id, filename, page, chunk_index,
                   small_chunk (Pass 2b), parent_chunk (Pass 2b).
    """
    if not text or not text.strip():
        logger.debug(
            "semantic_chunk: empty text filename=%s page=%s — skipping",
            filename, page_number,
        )
        return []

    # Pass 1
    raw_chunks = _split_pass1(text, soft_max=SEMANTIC_CHUNK_SOFT_MAX)
    if not raw_chunks:
        return []

    # Pass 2
    merge_start = time.time()
    merged_chunks = _split_pass2(
        raw_chunks,
        threshold=SEMANTIC_CHUNK_SIMILARITY_THRESHOLD,
        merge_min=SEMANTIC_CHUNK_MERGE_MIN,
        merge_max=SEMANTIC_CHUNK_MERGE_MAX,
    )
    merge_elapsed = time.time() - merge_start
    if merge_elapsed > SEMANTIC_CHUNK_MERGE_WARN_SECS:
        logger.warning(
            "Semantic merge took %.2fs (> %.1fs) filename=%s page=%s chunks=%s",
            merge_elapsed,
            SEMANTIC_CHUNK_MERGE_WARN_SECS,
            filename,
            page_number,
            len(merged_chunks),
        )

    # Pass 2b + Document construction
    try:
        from langchain_core.documents import Document as _Doc
    except Exception:
        from langchain.schema import Document as _Doc  # type: ignore

    documents = []
    for idx, chunk_text in enumerate(merged_chunks):
        if not chunk_text.strip():
            continue
        meta = {
            "document_id": document_id,
            "filename": filename,
            "page": page_number,
            "chunk_index": idx,
        }
        if SEMANTIC_CHUNK_HIERARCHICAL:
            meta["small_chunk"] = chunk_text
            meta["parent_chunk"] = _build_parent_context(merged_chunks, idx)
        documents.append(_Doc(page_content=chunk_text, metadata=meta))

    return documents


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


VALID_MODES = {"default", "tutor", "socratic", "eli5", "concise"}

class Question(BaseModel):
    question: str = Field(..., min_length=1, description="Question cannot be empty")
    session_id: UUID
    mode: str = Field(default="default")
    session_secret: str | None = None

    @field_validator("question")
    @classmethod
    def question_must_not_be_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Question cannot be whitespace only")
        return v

    @field_validator("mode")
    @classmethod
    def validate_mode(cls, v: str) -> str:
        normalized = v.strip().lower()
        if normalized not in VALID_MODES:
            raise ValueError(f"Invalid mode '{v}'. Must be one of {VALID_MODES}")
        return normalized


class SummarizeRequest(BaseModel):
    pdf: str | None = None
    session_id: UUID

    session_secret: str | None = None


class SessionLookupItem(BaseModel):
    session_id: UUID
    session_secret: str = Field(..., min_length=1)


class SessionsLookupRequest(BaseModel):
    sessions: list[SessionLookupItem] = Field(..., min_length=1, max_length=50)

@app.get("/sessions")
def get_sessions():
    raise HTTPException(
        status_code=410,
        detail="Endpoint removed. Use /sessions/lookup with session_id + session_secret.",
    )


def _require_session_secret(session: dict, provided_secret: str | None):
    candidate = (provided_secret or "").strip()
    if not candidate:
        raise HTTPException(status_code=403, detail="Forbidden")

    expected = (session.get("session_secret") or "").strip()
    if not expected or not secrets.compare_digest(candidate, expected):
        raise HTTPException(status_code=403, detail="Forbidden")


@app.post("/sessions/lookup")
def lookup_sessions(data: SessionsLookupRequest):
    cleanup_expired_sessions()

    sessions_out = []

    with sessions_lock:
        for item in data.sessions:
            sid = str(item.session_id)
            session = _touch_session_unlocked(sid)
            if not session:
                continue

            _require_session_secret(session, item.session_secret)

            sessions_out.append(
                {
                    "session_id": sid,
                    "created_at": session.get("created_at"),
                    "last_accessed": session.get("last_accessed"),
                    "documents": session.get("documents", []),
                    "chat": session.get("chat", []),
                }
            )

    return sessions_out

class SessionWriteRequest(BaseModel):
    session_id: UUID
    session_secret: str


@app.post("/process-pdf")
def process_pdf(
    file: UploadFile = File(...),
    session_id: str | None = Form(None),
    original_filename: str | None = Form(None),
    session_secret: str | None = Form(None)
):
    cleanup_expired_sessions()

    # If original_filename is provided, use it for display, otherwise fallback to the file's name (which might be a UUID)
    filename = original_filename or file.filename or "uploaded.pdf"
    if not filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF documents are supported.")
    requested_session_id = None
    if session_id:
        try:
            requested_session_id = normalize_session_id(session_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid session ID format.")
    requested_session_secret = (session_secret or "").strip() or None

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

    # ── Semantic chunking (Pass 1 + Pass 2 + Pass 2b) ────────────────────────
    # document_id is generated here so it can be embedded in chunk metadata
    # at construction time, avoiding a second metadata-overwrite loop.
    document_id = str(uuid.uuid4())

    all_chunks = []
    seen_content = set()
    for doc in docs:
        page_number = doc.metadata.get("page", 0)
        page_text = doc.page_content or ""
        for chunk_doc in semantic_chunk(page_text, filename, page_number, document_id):
            content = chunk_doc.page_content.strip()
            if content and content not in seen_content:
                seen_content.add(content)
                all_chunks.append(chunk_doc)
    chunks = all_chunks

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
        with session_store_lock(requested_session_id):
            with sessions_lock:
                session = _peek_session_unlocked(requested_session_id)
                if not session:
                    raise HTTPException(status_code=404, detail="Session expired or invalid. Please re-upload your PDFs.")
                expected_secret = (session.get("session_secret") or "").strip()
                if not expected_secret or not requested_session_secret or not secrets.compare_digest(requested_session_secret, expected_secret):
                    raise HTTPException(status_code=403, detail="Forbidden")
                if len(session.get("documents", [])) >= MAX_DOCUMENTS_PER_SESSION:
                    raise HTTPException(status_code=400, detail="Maximum number of documents per session reached.")
                current_chunks = sum(doc.get("chunk_count", 0) for doc in session.get("documents", []))
                if current_chunks + len(chunks) > MAX_CHUNKS_PER_SESSION:
                    raise HTTPException(status_code=400, detail="Maximum number of chunks per session exceeded.")
    elif len(chunks) > MAX_CHUNKS_PER_SESSION:
        raise HTTPException(
            status_code=400,
            detail=f"PDF is too large to index. A single document may not exceed {MAX_CHUNKS_PER_SESSION} chunks.",
        )

    document_id = str(uuid.uuid4())
    processing_session_id = requested_session_id
    created_placeholder_session = False

    if not processing_session_id:
        processing_session_id = str(uuid.uuid4())
        created_placeholder_session = True
        created_at = now_ts()
        new_session_secret = generate_session_secret()
        with sessions_lock:
            _cleanup_expired_sessions_unlocked()
            _enforce_max_sessions_unlocked()
            sessions[processing_session_id] = {
                "vectorstore": None,
                "lock": threading.Lock(),
                "documents": [],
                "session_secret": new_session_secret,
                "session_dir": None,
                "created_at": created_at,
                "last_accessed": created_at,
                "retrieval_cache": {},
                "chat": [],
            }
            persist_session_registry_entry(processing_session_id, sessions[processing_session_id])

        update_processing_progress(processing_session_id, "Starting", 5)

    update_processing_progress(
        processing_session_id,
        "Extracting text from PDF",
        15
    )
    now = now_ts()
    uploaded_document = {
        "document_id": document_id,
        "filename": filename,
        "static_url": f"/uploads/{os.path.basename(file.filename)}" if file.filename else None,
        "uploaded_at": now,
        "chunk_count": len(chunks),
    }

    # Stamp uploaded_at only — document_id, filename, page, chunk_index are
    # already set by semantic_chunk() at construction time.
    for chunk in chunks:
        chunk.metadata["uploaded_at"] = now

    try:
        embeddings = get_embedding_model()
    except Exception:
        logger.exception("Failed to load embedding model filename=%s", filename)

        if created_placeholder_session and processing_session_id:
            cleanup_failed_session(processing_session_id)

        raise HTTPException(
            status_code=503,
            detail=(
                "Embedding model is unavailable. Start the RAG service once with internet access "
                "to download sentence-transformers/all-MiniLM-L6-v2, or pre-download it into the "
                "local Hugging Face cache."
            ),
        )

    try:
        new_vectorstore = FAISS.from_documents(chunks, embeddings)
    except Exception:
        logger.exception("Failed to create vectorstore filename=%s", filename)

        if created_placeholder_session and processing_session_id:
            cleanup_failed_session(processing_session_id)

        raise HTTPException(
            status_code=500,
            detail="Failed to index the uploaded PDF.",
        )

    if requested_session_id:
        with session_store_lock(requested_session_id):
            with sessions_lock:
                session = _touch_session_unlocked(requested_session_id)
                if not session:
                    raise HTTPException(status_code=404, detail="Session expired or invalid. Please re-upload your PDFs.")
                session.setdefault("retrieval_cache", {})
                if "lock" not in session:
                    session["lock"] = threading.Lock()
                session_lock = session["lock"]
                vectorstore = session["vectorstore"]

            with session_lock:
                try:
                    vectorstore.merge_from(new_vectorstore)
                    persist_vectorstore(requested_session_id, vectorstore)
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
                persist_session_registry_entry(session_id, session)
                logger.info(
                    "Merged PDF into session session_id=%s filename=%s documents=%s chunks=%s",
                    session_id,
                    filename,
                    len(session["documents"]),
                    len(chunks),
                )
    else:
        session_id = processing_session_id

        with session_store_lock(session_id):
            with sessions_lock:
                existing_session = sessions.get(session_id)
                if not existing_session:
                    raise HTTPException(
                        status_code=500,
                        detail="Session initialization failed."
                    )

                session_secret = existing_session.get("session_secret")
                created_at = existing_session.get("created_at", now)

            session_dir = persist_vectorstore(session_id, new_vectorstore)

            with sessions_lock:
                sessions[session_id] = {
                    "vectorstore": new_vectorstore,
                    "lock": threading.Lock(),
                    "documents": [uploaded_document],
                    "session_secret": session_secret,
                    "session_dir": session_dir,
                    "created_at": created_at,
                    "last_accessed": now,
                    "retrieval_cache": {},
                    "chat": [],
                }

                persist_session_registry_entry(
                    session_id,
                    sessions[session_id]
                )

        logger.info(
            "Created session session_id=%s filename=%s chunks=%s",
            session_id,
            filename,
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
        "session_secret": sessions[session_id].get("session_secret"),
        "document": uploaded_document,
        "documents": documents,
    }


@app.post("/validate-session-write")
def validate_session_write(data: SessionWriteRequest):
    session_id = str(data.session_id)
    provided_secret = (data.session_secret or "").strip()

    if not provided_secret:
        raise HTTPException(status_code=403, detail="Forbidden")

    with session_store_lock(session_id):
        with sessions_lock:
            session = _peek_session_unlocked(session_id)
            if not session:
                raise HTTPException(status_code=404, detail="Session expired or invalid. Please re-upload your PDFs.")

            expected_secret = (session.get("session_secret") or "").strip()
            if not expected_secret or not secrets.compare_digest(provided_secret, expected_secret):
                raise HTTPException(status_code=403, detail="Forbidden")

    return {"allowed": True}




@app.get("/processing-status/{session_id}")
def processing_status(session_id: str, session_secret: str | None = None):

    with sessions_lock:
        meta = _touch_session_unlocked(session_id)
        if meta:
            _require_session_secret(meta, session_secret)
        progress = meta.get("processing_progress") if meta else None

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
    mode = data.mode

    # Normalize query for cache reuse
    normalized_query = normalize_query(question)
    

    with sessions_lock:

        session = _touch_session_unlocked(session_id)

        if not session:
            raise HTTPException(
                status_code=404,
                detail="Session expired or invalid. Please re-upload your PDFs."
            )

        _require_session_secret(session, data.session_secret)

        if "lock" not in session:
            session["lock"] = threading.Lock()

        session_lock = session["lock"]
        if not session.get("vectorstore"):
            try:
                session["vectorstore"] = FAISS.load_local(str(FAISS_DIR / session_id), get_embedding_model(), allow_dangerous_deserialization=True)
            except Exception as e:
                logger.error(f"Failed to lazy load vectorstore: {e}")
                raise HTTPException(status_code=500, detail="Failed to load session index.")
        vectorstore = session["vectorstore"]

        # Session-level retrieval cache
        retrieval_cache = session.setdefault(
            "retrieval_cache",
            OrderedDict()
        )

        cleanup_retrieval_cache(retrieval_cache)
        # Cache hit
        cache_key = f"{mode}:{normalized_query}"
        cached_value = retrieval_cache.get(cache_key)
        if isinstance(cached_value, dict) and "scored_candidates" in cached_value:
            logger.info(
                "Retrieval cache hit session_id=%s cache_key=%s",
                session_id,
                cache_key,
            )
            scored_candidates = cached_value["scored_candidates"]
            cache_hit = True
        elif cached_value is not None:
            logger.info(
                "Retrieval cache invalidated session_id=%s cache_key=%s",
                session_id,
                cache_key,
            )
            retrieval_cache.pop(cache_key, None)
            cache_hit = False

        else:
            cache_hit = False

    try:
        with session_lock:
            indexed_documents = collect_index_documents(vectorstore)

            if not cache_hit:
                logger.info(
                    "Retrieval cache miss session_id=%s cache_key=%s",
                    session_id,
                    cache_key,
                )
                scored_candidates = search_retrieval_candidates(
                    vectorstore,
                    question,
                    ASK_RETRIEVAL_CANDIDATES,
                )

                with sessions_lock:
                    session = sessions.get(session_id)
                    if session:
                        retrieval_cache = session.setdefault("retrieval_cache", {})
                        if len(retrieval_cache) >= RETRIEVAL_CACHE_LIMIT:
                            oldest_key = next(iter(retrieval_cache))
                            del retrieval_cache[oldest_key]
                        retrieval_cache[cache_key] = {
                            "cached_at": now_ts(),
                            "scored_candidates": scored_candidates,
                        }

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
        response_payload = {
            "answer": INSUFFICIENT_CONTEXT_MESSAGE,
            "sources": [],
            "retrieval_type": "refusal",
            "mode": mode,
            "cache_hit": cache_hit,
        }
        with sessions_lock:
            session = sessions.get(session_id)
            if session:
                session.setdefault("chat", []).append({
                    "question": question,
                    "answer": INSUFFICIENT_CONTEXT_MESSAGE,
                    "sources": [],
                    "mode": mode
                })
                save_sessions_unlocked()
        return response_payload

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

    citation_sources = [
        citation_source_for_document(doc, idx)
        for idx, doc in enumerate(docs)
    ]

    source_id_by_key = {
        document_dedupe_key(doc): idx + 1
        for idx, doc in enumerate(docs)
    }

    if mode == "socratic":
        framed = apply_mode_framing("", question, mode, docs, context)
        response_payload = {
            "answer": framed,
            "sources": citation_sources,
            "retrieval_type": "socratic",
            "cache_hit": cache_hit,
            "mode": mode,
        }
        with sessions_lock:
            session = sessions.get(session_id)
            if session:
                session.setdefault("chat", []).append({
                    "question": question,
                    "answer": framed,
                    "sources": citation_sources,
                    "mode": mode
                })
                save_sessions_unlocked()
        return response_payload

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
        response_payload = {
            "answer": grounded_answer,
            "sources": citation_sources,
            "retrieval_type": "citation-aware",
            "cache_hit": cache_hit,
            "mode": mode,
        }
        with sessions_lock:
            session = sessions.get(session_id)
            if session:
                session.setdefault("chat", []).append({
                    "question": question,
                    "answer": grounded_answer,
                    "sources": citation_sources,
                    "mode": mode
                })
                save_sessions_unlocked()
        return response_payload
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
            response_payload = {
                "answer": INSUFFICIENT_CONTEXT_MESSAGE,
                "sources": citation_sources,
                "retrieval_type": "refusal",
                "mode": mode,
                "cache_hit": cache_hit,
            }
            with sessions_lock:
                session = sessions.get(session_id)
                if session:
                    session.setdefault("chat", []).append({
                        "question": question,
                        "answer": INSUFFICIENT_CONTEXT_MESSAGE,
                        "sources": citation_sources,
                        "mode": mode
                    })
                    save_sessions_unlocked()
            return response_payload
        logger.info(
            "Returning grounded answer session_id=%s intent=%s retrieved_chunks=%s sources=%s",
            session_id,
            intent,
            len(docs),
            retrieved_sources,
        )

        framed = apply_mode_framing(grounded_answer, question, mode, docs, context)

        # If citations were required and mode-framing stripped them, revert to original.
        if ASK_REQUIRE_CITATIONS and not answer_contains_citation(framed, len(docs)):
            logger.info(
                "Mode framing stripped citations; reverting to grounded answer session_id=%s mode=%s",
                session_id,
                mode,
            )
            framed = grounded_answer

        result = {
            "answer": framed,
            "sources": citation_sources,
            "retrieval_type": "citation-aware",
            "cache_hit": cache_hit,
            "mode": mode,
        }
        
        with sessions_lock:
            session = sessions.get(session_id)
            if session:
                session.setdefault("chat", []).append({
                    "question": question,
                    "answer": framed,
                    "sources": citation_sources,
                    "mode": mode
                })
                save_sessions_unlocked()
        return result

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
    
    framed = apply_mode_framing(answer, question, mode, docs, context)

    # If citations were required and mode-framing stripped them, revert to original.
    if ASK_REQUIRE_CITATIONS and not answer_contains_citation(framed, len(docs)):
        logger.info(
            "Mode framing stripped citations; reverting to generated answer session_id=%s mode=%s",
            session_id,
            mode,
        )
        framed = answer

    response_payload = {
        "answer": framed,
        "sources": citation_sources,
        "retrieval_type": "citation-aware",
        "cache_hit": cache_hit,
        "mode": mode,
    }

    with sessions_lock:

        session = sessions.get(session_id)

        if session:

            retrieval_cache = session.setdefault(
                "retrieval_cache",
                {}
            )

            session.setdefault("chat", []).append({
                "question": question,
                "answer": framed,
                "sources": citation_sources,
                "mode": mode
            })
            save_sessions_unlocked()

    return response_payload

@app.post("/ask/stream")
def ask_question_stream(data: Question):
    """
    Streaming variant of /ask. Returns the generated answer as a plain-text
    chunked response so the frontend can render tokens progressively.

    Retrieval and evidence-gating are identical to /ask. Generation is run in
    a background thread using TextIteratorStreamer so the HTTP response can
    begin before the model has finished producing all tokens.

    Authentication is enforced by internal_auth_middleware — this endpoint is
    in both `protected_paths` (exact match) and under the `/ask/` prefix guard,
    so it cannot be reached without a valid X-Internal-Token when
    INTERNAL_RAG_TOKEN is configured.
    """
    cleanup_expired_sessions()

    question = (data.question or "").strip()
    if not question:
        raise HTTPException(status_code=400, detail="Question is required.")

    intent = detect_question_intent(question)
    session_id = str(data.session_id)
    mode = data.mode
    normalized_query = normalize_query(question)

    with sessions_lock:
        session = _touch_session_unlocked(session_id)
        if not session:
            raise HTTPException(
                status_code=404,
                detail="Session expired or invalid. Please re-upload your PDFs.",
            )

        _require_session_secret(session, data.session_secret)

        if "lock" not in session:
            session["lock"] = threading.Lock()

        session_lock = session["lock"]
        if not session.get("vectorstore"):
            try:
                session["vectorstore"] = FAISS.load_local(
                    str(FAISS_DIR / session_id),
                    get_embedding_model(),
                    allow_dangerous_deserialization=True,
                )
            except Exception as exc:
                logger.error("Failed to lazy load vectorstore session_id=%s error=%s", session_id, exc)
                raise HTTPException(status_code=500, detail="Failed to load session index.")
        vectorstore = session["vectorstore"]

        retrieval_cache = session.setdefault("retrieval_cache", OrderedDict())
        cleanup_retrieval_cache(retrieval_cache)
        cache_key = f"{mode}:{normalized_query}"
        cached_value = retrieval_cache.get(cache_key)
        if isinstance(cached_value, dict) and "scored_candidates" in cached_value:
            logger.info(
                "Stream retrieval cache hit session_id=%s cache_key=%s",
                session_id,
                cache_key,
            )
            scored_candidates = cached_value["scored_candidates"]
            cache_hit = True
        elif cached_value is not None:
            logger.info(
                "Stream retrieval cache invalidated session_id=%s cache_key=%s",
                session_id,
                cache_key,
            )
            retrieval_cache.pop(cache_key, None)
            cache_hit = False
        else:
            cache_hit = False

    try:
        with session_lock:
            indexed_documents = collect_index_documents(vectorstore)
            if not cache_hit:
                logger.info(
                    "Stream retrieval cache miss session_id=%s cache_key=%s",
                    session_id,
                    cache_key,
                )
                scored_candidates = search_retrieval_candidates(
                    vectorstore,
                    question,
                    ASK_RETRIEVAL_CANDIDATES,
                )
                with sessions_lock:
                    current_session = sessions.get(session_id)
                    if current_session:
                        rc = current_session.setdefault("retrieval_cache", OrderedDict())
                        if len(rc) >= RETRIEVAL_CACHE_LIMIT:
                            oldest = next(iter(rc))
                            del rc[oldest]
                        rc[cache_key] = {
                            "cached_at": now_ts(),
                            "scored_candidates": scored_candidates,
                        }
    except Exception:
        logger.exception("Stream similarity search failed session_id=%s", session_id)
        raise HTTPException(status_code=500, detail="Failed to search the uploaded documents.")

    docs = (
        representative_documents_by_source(indexed_documents)
        if intent == "overview"
        else diversify_retrieved_documents(scored_candidates, question)
    )

    best_score = scored_candidates[0][1] if scored_candidates else None
    if not passes_evidence_gate(question, docs, best_score, intent):
        logger.info(
            "Stream evidence gate refused session_id=%s intent=%s best_score=%s",
            session_id,
            intent,
            best_score,
        )

        def _refuse_stream():
            yield INSUFFICIENT_CONTEXT_MESSAGE

        return StreamingResponse(_refuse_stream(), media_type="text/plain; charset=utf-8")

    context = format_context(docs)

    grounded_answer = build_answer_from_documents(
        question,
        docs,
        intent,
        source_id_by_key={document_dedupe_key(doc): idx + 1 for idx, doc in enumerate(docs)},
    )

    # For grounded (non-LLM) answers, stream the result directly without
    # spinning up a generation thread — there are no tokens to generate.
    if grounded_answer != INSUFFICIENT_CONTEXT_MESSAGE and grounded_answer:
        citation_sources = [citation_source_for_document(doc, idx) for idx, doc in enumerate(docs)]
        framed = apply_mode_framing(grounded_answer, question, mode, docs, context)
        if ASK_REQUIRE_CITATIONS and not answer_contains_citation(framed, len(docs)):
            framed = grounded_answer

        with sessions_lock:
            current_session = sessions.get(session_id)
            if current_session:
                current_session.setdefault("chat", []).append({
                    "question": question,
                    "answer": framed,
                    "sources": citation_sources,
                    "mode": mode,
                })
                save_sessions_unlocked()

        def _grounded_stream():
            yield framed

        return StreamingResponse(_grounded_stream(), media_type="text/plain; charset=utf-8")

    # LLM generation path — run in a background thread so we can stream tokens
    # back to the caller as they are produced rather than waiting for the full
    # completion before sending anything.
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
        "Stream executing query session_id=%s retrieved_chunks=%s",
        session_id,
        len(docs),
    )

    def _generate_and_stream():
        try:
            tokenizer, model, is_encoder_decoder = load_generation_model()
            model_device = next(model.parameters()).device
            encoded = tokenizer(prompt, return_tensors="pt", truncation=True, max_length=2048)
            encoded = {k: v.to(model_device) for k, v in encoded.items()}
            pad_token_id = (
                tokenizer.pad_token_id
                if tokenizer.pad_token_id is not None
                else tokenizer.eos_token_id
            )
            streamer = TextIteratorStreamer(
                tokenizer,
                skip_prompt=True,
                skip_special_tokens=True,
            )

            generate_kwargs = {
                **encoded,
                "max_new_tokens": 256,
                "do_sample": False,
                "pad_token_id": pad_token_id,
                "streamer": streamer,
            }

            generation_thread = threading.Thread(
                target=_run_generation_locked,
                args=(model, generate_kwargs),
                daemon=True,
            )
            generation_thread.start()

            full_answer_parts = []
            for token_text in streamer:
                if token_text:
                    full_answer_parts.append(token_text)
                    yield token_text

            generation_thread.join(timeout=180)

            full_answer = "".join(full_answer_parts).strip()
            citation_sources = [citation_source_for_document(doc, idx) for idx, doc in enumerate(docs)]
            with sessions_lock:
                current_session = sessions.get(session_id)
                if current_session:
                    current_session.setdefault("chat", []).append({
                        "question": question,
                        "answer": full_answer,
                        "sources": citation_sources,
                        "mode": mode,
                    })
                    save_sessions_unlocked()
        except Exception:
            logger.exception("Stream generation failed session_id=%s", session_id)
            yield "\n[Generation error. Please try again.]"

    return StreamingResponse(_generate_and_stream(), media_type="text/plain; charset=utf-8")


def _run_generation_locked(model, generate_kwargs):
    """Run model.generate() under the global generation lock in a background thread.

    Keeping the forward pass serialised prevents concurrent GPU/CPU memory
    exhaustion while still allowing the calling thread to iterate the streamer
    and forward tokens to the HTTP client as they arrive.
    """
    with generation_lock:
        with torch.no_grad():
            model.generate(**generate_kwargs)


@app.post("/summarize")
def summarize_pdf(data: SummarizeRequest):
    cleanup_expired_sessions()
    session_id = str(data.session_id)
    with sessions_lock:
        session = _touch_session_unlocked(session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session expired or invalid. Please re-upload your PDFs.")
        _require_session_secret(session, data.session_secret)
        if "lock" not in session:
            session["lock"] = threading.Lock()
        session_lock = session["lock"]
        if not session.get("vectorstore"):
            try:
                session["vectorstore"] = FAISS.load_local(str(FAISS_DIR / session_id), get_embedding_model(), allow_dangerous_deserialization=True)
            except Exception as e:
                logger.error(f"Failed to lazy load vectorstore: {e}")
                raise HTTPException(status_code=500, detail="Failed to load session index.")
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
