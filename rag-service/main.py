
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from langchain_community.document_loaders import PyPDFLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_community.vectorstores import FAISS
from langchain_community.embeddings import HuggingFaceEmbeddings
from dotenv import load_dotenv
import os
import uuid
import uvicorn
import torch
from transformers import AutoConfig, AutoTokenizer, AutoModelForSeq2SeqLM, AutoModelForCausalLM
import threading
import time
import logging

load_dotenv()


app = FastAPI()

# Session storage with metadata and thread safety
sessions = {}
sessions_lock = threading.Lock()
logger = logging.getLogger("pdf_qa_rag")
logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)

# Configurable session TTL and max cap
SESSION_TTL_MINUTES = int(os.getenv("SESSION_TTL_MINUTES", "30"))
MAX_ACTIVE_SESSIONS = int(os.getenv("MAX_ACTIVE_SESSIONS", "100"))

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
        # Expire old sessions
        ttl_seconds = SESSION_TTL_MINUTES * 60
        for sid, meta in list(sessions.items()):
            if now_ts() - meta["last_accessed"] > ttl_seconds:
                expired.append(sid)
        for sid in expired:
            del sessions[sid]
        # Enforce max cap (evict oldest)
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
        source = doc.metadata.get("filename") or doc.metadata.get("source", "")
        page = doc.metadata.get("page", "")
        content_key = " ".join(doc.page_content.split())[:500]
        key = (source, page, content_key)
        if key in seen:
            continue
        seen.add(key)
        unique.append(doc)
    return unique


def format_context(documents, max_chars=7000):
    context_parts = []
    remaining = max_chars
    for doc in documents:
        filename = doc.metadata.get("filename", "uploaded document")
        page = doc.metadata.get("page")
        source_label = f"{filename}, page {page + 1}" if isinstance(page, int) else filename
        content = doc.page_content.strip()
        if not content:
            continue
        block = f"[Source: {source_label}]\n{content}"
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

# Load local embedding model
embedding_model = HuggingFaceEmbeddings(model_name="sentence-transformers/all-MiniLM-L6-v2")


def load_generation_model():
    global generation_tokenizer, generation_model, generation_is_encoder_decoder
    if generation_model is not None and generation_tokenizer is not None:
        return generation_tokenizer, generation_model, generation_is_encoder_decoder

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
    return generation_tokenizer, generation_model, generation_is_encoder_decoder


def generate_response(prompt: str, max_new_tokens: int) -> str:
    tokenizer, model, is_encoder_decoder = load_generation_model()
    model_device = next(model.parameters()).device

    encoded = tokenizer(prompt, return_tensors="pt", truncation=True, max_length=2048)
    encoded = {key: value.to(model_device) for key, value in encoded.items()}
    pad_token_id = tokenizer.pad_token_id if tokenizer.pad_token_id is not None else tokenizer.eos_token_id

    with torch.no_grad():
        generated_ids = model.generate(
            **encoded,
            max_new_tokens=max_new_tokens,
            do_sample=False,
            pad_token_id=pad_token_id,
        )

    if is_encoder_decoder:
        text = tokenizer.decode(generated_ids[0], skip_special_tokens=True)
        return text.strip()

    input_len = encoded["input_ids"].shape[1]
    new_tokens = generated_ids[0][input_len:]
    text = tokenizer.decode(new_tokens, skip_special_tokens=True)
    return text.strip()

class PDFPath(BaseModel):
    filePath: str
    session_id: str | None = None
    filename: str | None = None

class Question(BaseModel):
    question: str
    session_id: str


class SummarizeRequest(BaseModel):
    pdf: str | None = None
    session_id: str


@app.post("/process-pdf")
def process_pdf(data: PDFPath):
    cleanup_expired_sessions()
    file_path = (data.filePath or "").strip()
    requested_session_id = (data.session_id or "").strip() or None
    filename = data.filename or os.path.basename(file_path) or "uploaded.pdf"

    if not file_path:
        raise HTTPException(status_code=400, detail="Missing PDF file path.")
    if not os.path.exists(file_path):
        raise HTTPException(status_code=400, detail="Uploaded PDF file was not found.")
    if not filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF documents are supported.")

    if requested_session_id and not validate_existing_session(requested_session_id):
        raise HTTPException(status_code=404, detail="Session expired or invalid. Please re-upload your PDFs.")

    logger.info(
        "Processing PDF filename=%s existing_session=%s",
        filename,
        bool(requested_session_id),
    )

    try:
        loader = PyPDFLoader(file_path)
        docs = loader.load()
    except Exception as exc:
        logger.warning("Failed to load PDF filename=%s error=%s", filename, exc)
        raise HTTPException(status_code=400, detail="Unable to read this PDF. It may be corrupted or encrypted.")

    if not docs:
        raise HTTPException(status_code=400, detail="No readable pages were found in the PDF.")

    splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=100)
    chunks = splitter.split_documents(docs)
    if not chunks:
        raise HTTPException(status_code=400, detail="No text chunks generated from the PDF. Please check your file.")

    document_id = str(uuid.uuid4())
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
            try:
                session["vectorstore"].merge_from(new_vectorstore)
            except Exception:
                logger.exception(
                    "Failed to merge vectorstore session_id=%s filename=%s",
                    requested_session_id,
                    filename,
                )
                raise HTTPException(status_code=500, detail="Failed to merge the uploaded PDF into this session.")

            session.setdefault("documents", []).append(uploaded_document)
            session["last_accessed"] = now
            session_id = requested_session_id
            logger.info(
                "Merged PDF into session session_id=%s filename=%s documents=%s chunks=%s",
                session_id,
                filename,
                len(session["documents"]),
                len(chunks),
            )
        else:
            _enforce_max_sessions_unlocked()
            session_id = str(uuid.uuid4())
            sessions[session_id] = {
                "vectorstore": new_vectorstore,
                "documents": [uploaded_document],
                "created_at": now,
                "last_accessed": now,
            }
            logger.info(
                "Created session session_id=%s filename=%s chunks=%s",
                session_id,
                filename,
                len(chunks),
            )

        documents = list(sessions[session_id].get("documents", []))

    return {
        "message": "PDF processed successfully",
        "session_id": session_id,
        "document": uploaded_document,
        "documents": documents,
    }




@app.post("/ask")
def ask_question(data: Question):
    cleanup_expired_sessions()
    question = (data.question or "").strip()
    if not question:
        raise HTTPException(status_code=400, detail="Question is required.")

    with sessions_lock:
        session = _touch_session_unlocked(data.session_id)
        if not session or not session.get("vectorstore"):
            raise HTTPException(status_code=404, detail="Session expired or invalid. Please re-upload your PDFs.")
        try:
            docs = session["vectorstore"].similarity_search(question, k=8)
        except Exception:
            logger.exception("Similarity search failed session_id=%s", data.session_id)
            raise HTTPException(status_code=500, detail="Failed to search the uploaded documents.")

    docs = unique_documents(docs)[:5]
    if not docs:
        return {"answer": "No relevant context found."}

    context = format_context(docs, max_chars=6500)

    prompt = (
        "You are a helpful assistant for question answering over one or more PDF documents. "
        "Use only the provided context. If the context does not contain the answer, say so briefly.\n\n"
        f"Context:\n{context}\n\n"
        f"Question: {question}\n"
        "Answer:"
    )

    logger.info(
        "Executing query session_id=%s retrieved_chunks=%s",
        data.session_id,
        len(docs),
    )
    answer = generate_response(prompt, max_new_tokens=256)
    return {"answer": answer}




@app.post("/summarize")
def summarize_pdf(data: SummarizeRequest):
    cleanup_expired_sessions()
    with sessions_lock:
        session = _touch_session_unlocked(data.session_id)
        if not session or not session.get("vectorstore"):
            raise HTTPException(status_code=404, detail="Session expired or invalid. Please re-upload your PDFs.")
        uploaded_documents = list(session.get("documents", []))
        indexed_documents = collect_index_documents(session["vectorstore"])

    if not uploaded_documents or not indexed_documents:
        return {"summary": "No document context available to summarize."}

    logger.info(
        "Summarizing session session_id=%s documents=%s",
        data.session_id,
        len(uploaded_documents),
    )

    document_summaries = []
    per_document_contexts = []
    for uploaded_document in uploaded_documents:
        document_chunks = documents_for_upload(indexed_documents, uploaded_document["document_id"])
        document_chunks = unique_documents(document_chunks)[:4]
        if not document_chunks:
            document_summaries.append(f"## {uploaded_document['filename']}\n\nNo readable context available.")
            continue

        context = format_context(document_chunks, max_chars=3500)
        per_document_contexts.append(f"{uploaded_document['filename']}:\n{context}")
        prompt = (
            "Summarize this PDF in 3-5 concise bullets. Focus on the core ideas and useful details.\n\n"
            f"Context:\n{context}\n\n"
            "Summary:"
        )
        summary = generate_response(prompt, max_new_tokens=180)
        document_summaries.append(f"## {uploaded_document['filename']}\n\n{summary}")

    combined_context = "\n\n".join(per_document_contexts)
    combined_summary = ""
    if combined_context:
        combined_prompt = (
            "Across these PDFs, provide high-level combined insights in 3-5 concise bullets. "
            "Mention relationships, contrasts, or shared themes when supported by the context.\n\n"
            f"Context:\n{combined_context[:6500]}\n\n"
            "Combined Insights:"
        )
        combined_summary = generate_response(combined_prompt, max_new_tokens=180)

    summary_parts = document_summaries
    if combined_summary:
        summary_parts.append(f"## Combined Insights\n\n{combined_summary}")

    return {"summary": "\n\n".join(summary_parts)}


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=5000, reload=True)
