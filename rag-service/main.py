
from fastapi import FastAPI
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

load_dotenv()


app = FastAPI()

# Session storage with metadata and thread safety
sessions = {}
sessions_lock = threading.Lock()

# Configurable session TTL and max cap
SESSION_TTL_MINUTES = int(os.getenv("SESSION_TTL_MINUTES", "30"))
MAX_ACTIVE_SESSIONS = int(os.getenv("MAX_ACTIVE_SESSIONS", "100"))
FAISS_DISTANCE_THRESHOLD = float(os.getenv("FAISS_DISTANCE_THRESHOLD", "1.2"))
NO_RELEVANT_ANSWER = (
    "The document does not appear to contain information about this question."
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
        print(
            f"[SessionCleanup] "
            f"Expired: {len(expired)}, "
            f"Evicted: {evicted_count}, "
            f"Active: {active_sessions}"
        )
# Helper to get a valid session (handles TTL, locking, and last_accessed update)
def get_valid_session(session_id: str):
    meta = get_session_meta(session_id)
    return meta["vectorstore"] if meta else None


def get_session_meta(session_id: str):
    with sessions_lock:
        meta = sessions.get(session_id)
        if not meta:
            return None
        ttl_seconds = SESSION_TTL_MINUTES * 60
        if now_ts() - meta["last_accessed"] > ttl_seconds:
            del sessions[session_id]
            return None
        meta["last_accessed"] = now_ts()
        return meta
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


def retrieve_relevant_docs(vectorstore, query: str, k: int = 4):
    docs_with_scores = vectorstore.similarity_search_with_score(query, k=k)
    return [doc for doc, score in docs_with_scores if score <= FAISS_DISTANCE_THRESHOLD]


def extract_source_pages(docs):
    return sorted(
        {
            doc.metadata.get("page", 0) + 1
            for doc in docs
            if doc.metadata and "page" in doc.metadata
        }
    )


class PDFPath(BaseModel):
    filePath: str
    session_id: str | None = None

class Question(BaseModel):
    question: str
    session_id: str


class SummarizeRequest(BaseModel):
    pdf: str | None = None
    session_id: str


@app.post("/process-pdf")
def process_pdf(data: PDFPath):
    cleanup_expired_sessions()
    loader = PyPDFLoader(data.filePath)
    docs = loader.load()

    splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=100)
    chunks = splitter.split_documents(docs)
    if not chunks:
        return {"error": "No text chunks generated from the PDF. Please check your file."}

    new_store = FAISS.from_documents(chunks, embedding_model)
    now = now_ts()
    append_id = data.session_id

    if append_id:
        with sessions_lock:
            meta = sessions.get(append_id)
            if meta:
                ttl_seconds = SESSION_TTL_MINUTES * 60
                if now_ts() - meta["last_accessed"] <= ttl_seconds:
                    meta["vectorstore"].merge_from(new_store)
                    docs = meta.setdefault("documents", [])
                    docs.append(os.path.basename(data.filePath))
                    meta["last_accessed"] = now_ts()
                    return {
                        "message": "PDF added to session successfully",
                        "session_id": append_id,
                        "document_count": len(docs),
                    }

    session_id = str(uuid.uuid4())
    with sessions_lock:
        while len(sessions) >= MAX_ACTIVE_SESSIONS:
            oldest = min(sessions.items(), key=lambda x: x[1]["created_at"])[0]
            del sessions[oldest]
        sessions[session_id] = {
            "vectorstore": new_store,
            "created_at": now,
            "last_accessed": now,
            "documents": [os.path.basename(data.filePath)],
        }
    return {
        "message": "PDF processed successfully",
        "session_id": session_id,
        "document_count": 1,
    }




@app.post("/ask")
def ask_question(data: Question):
    cleanup_expired_sessions()
    vectorstore = get_valid_session(data.session_id)
    if not vectorstore:
        return {"answer": "Session expired or invalid. Please re-upload the PDF!"}

    docs = retrieve_relevant_docs(vectorstore, data.question, k=4)
    if not docs:
        return {"answer": NO_RELEVANT_ANSWER, "sources": []}

    context = "\n\n".join([doc.page_content for doc in docs])
    source_pages = extract_source_pages(docs)

    prompt = (
        "You are a helpful assistant for question answering over PDF documents. "
        "Use only the provided context. If the context does not contain the answer, say so briefly.\n\n"
        f"Context:\n{context}\n\n"
        f"Question: {data.question}\n"
        "Answer:"
    )

    answer = generate_response(prompt, max_new_tokens=256)
    return {"answer": answer, "sources": source_pages}




@app.post("/summarize")
def summarize_pdf(data: SummarizeRequest):
    cleanup_expired_sessions()
    vectorstore = get_valid_session(data.session_id)
    if not vectorstore:
        return {"summary": "Session expired or invalid. Please re-upload the PDF!"}

    docs = vectorstore.similarity_search("Give a concise summary of the document.", k=6)
    if not docs:
        return {"summary": "No document context available to summarize."}

    context = "\n\n".join([doc.page_content for doc in docs])
    prompt = (
        "Summarize the following document content in 6-8 concise bullet points.\n\n"
        f"Context:\n{context}\n\n"
        "Summary:"
    )

    summary = generate_response(prompt, max_new_tokens=220)
    return {"summary": summary}


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=5000, reload=True)
