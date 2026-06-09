from __future__ import annotations

import os
import sys
from pathlib import Path
from typing import Optional

# Load .env automatically for local demos (both repo-root and rag-service/.env).
try:  # pragma: no cover
    from dotenv import load_dotenv  # type: ignore

    _here = Path(__file__).resolve()
    _rag_service_root = _here.parents[1]
    _repo_root = _rag_service_root.parent

    load_dotenv(_repo_root / ".env", override=False)
    load_dotenv(_rag_service_root / ".env", override=False)
except Exception:
    pass

# Allow running as: `python scripts/demo_mongodb_pdf_rag.py` from the rag-service folder.
# (When executed by path, Python puts `scripts/` on sys.path, not the project root.)
RAG_SERVICE_ROOT = Path(__file__).resolve().parents[1]
if str(RAG_SERVICE_ROOT) not in sys.path:
    sys.path.insert(0, str(RAG_SERVICE_ROOT))

from crawler.agent import CrawlerAgent  # noqa: E402
from crawler.mongodb_connector import MongoDBConnector  # noqa: E402


def _env(name: str, default: Optional[str] = None) -> Optional[str]:
    value = os.getenv(name, default)
    if value is None:
        return None
    value = value.strip()
    return value or None


def main() -> int:
    """
    Demo: MongoDB (unstructured docs that may contain PDFs) -> extracted text -> simple RAG retrieval.

    This script is meant for screen-recordings / manual verification.

    Required env:
      - MONGODB_URI
      - MONGO_DB
      - MONGO_COLLECTION

    Optional env:
      - MONGO_LIMIT (default: 3)
      - RAG_QUERY (default: "What is this document about?")
    """
    mongo_uri = _env("MONGODB_URI")
    mongo_db = _env("MONGO_DB")
    mongo_collection = _env("MONGO_COLLECTION")

    if not mongo_uri or not mongo_db or not mongo_collection:
        print(
            "Missing required env vars. Set: MONGODB_URI, MONGO_DB, MONGO_COLLECTION",
            file=sys.stderr,
        )
        return 2

    limit = int(_env("MONGO_LIMIT", "3") or "3")
    query = _env("RAG_QUERY", "What is this document about?") or "What is this document about?"

    print("[1/5] Connecting to MongoDB…")
    connector = MongoDBConnector(
        uri=mongo_uri,
        database=mongo_db,
        collection=mongo_collection,
        limit=limit,
    )

    agent = CrawlerAgent(connector=connector, source_name="mongodb")

    print("[2/5] Extracting Documents (PDF blobs -> text when present)…")
    docs = list(agent.iter_documents())
    print(f"  Extracted {len(docs)} document(s)")
    if not docs:
        print(
            "No documents produced. Ensure your collection contains fields like "
            "'pdf_bytes' / 'pdf' / 'pdf_base64' (bytes or base64 text), or adjust the data.",
            file=sys.stderr,
        )
        return 3

    print("[3/5] Chunking + embedding into FAISS…")
    from langchain_community.embeddings import HuggingFaceEmbeddings
    from langchain_community.vectorstores import FAISS
    from langchain_text_splitters import RecursiveCharacterTextSplitter

    splitter = RecursiveCharacterTextSplitter(chunk_size=800, chunk_overlap=120)
    chunks = splitter.split_documents(docs)
    print(f"  Chunks: {len(chunks)}")

    embeddings = HuggingFaceEmbeddings(model_name="sentence-transformers/all-MiniLM-L6-v2")
    vectorstore = FAISS.from_documents(chunks, embeddings)

    print("[4/5] Similarity search…")
    results = vectorstore.similarity_search(query, k=3)
    print(f"  Query: {query}")
    print(f"  Top matches: {len(results)}")

    print("[5/5] Preview (first match snippet):")
    top = results[0]
    snippet = (top.page_content or "").strip().replace("\n", " ")
    print(f"  metadata={top.metadata}")
    print(f"  snippet={snippet[:220]}{'…' if len(snippet) > 220 else ''}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
