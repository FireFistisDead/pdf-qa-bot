# Crawler Agent (RAG DB Ingestion) — Architecture

This folder defines a **crawler agent** architecture for ingesting **database-backed knowledge** into a RAG index.

The goal is to support "RAG over DBs" by:

- Connecting to a data source (SQLite/Postgres/MySQL/etc.)
- Extracting records (tables, rows, views, or query results)
- Converting records into LangChain `Document`s
- Chunking + embedding documents
- Writing them into a vector store (FAISS now, pluggable later)

## Components

### 1) `DatabaseConnector`
Responsible for connecting to a database and yielding **records** in a stable streaming fashion.

Key requirements:
- Streaming iteration (no full table loads)
- Bounded memory usage
- Back-pressure friendly (generator interface)
- Sanitized metadata (no secrets, no PII by default)

### 2) `DocumentBuilder`
Responsible for converting DB records into LangChain `Document`s:
- `page_content`: the text representation used by embeddings/search
- `metadata`: provenance fields (db type, table, primary key/id, etc.)

### 3) `CrawlerAgent`
Coordinates:
- Connector → DocumentBuilder → (optional) chunking → vector store write

The agent should be runnable in two modes:
- **one-shot**: run once and exit (CI, cron, manual)
- **daemon**: run periodically (future)

## Initial implementation (this PR)

This PR provides:
- A generic connector interface
- A `MongoDBConnector` example (optional dependency: `pymongo`) for unstructured docs
- A simple `SQLiteConnector` example (stdlib `sqlite3`)
- PDF text extraction support when a record contains a PDF blob (bytes or base64)
- Minimal tests ensuring we can extract documents safely

## Quick demo (for PR screen recording)

To demonstrate **DB → PDF → RAG** end-to-end locally:

1. Install deps (plus optional MongoDB client):
   - `python -m pip install -r requirements.txt`
   - `python -m pip install pymongo`
2. Set env vars for your MongoDB collection:
   - `MONGODB_URI=...`
   - `MONGO_DB=...`
   - `MONGO_COLLECTION=...`
3. Run:
   - `python scripts/demo_mongodb_pdf_rag.py`

The script connects to MongoDB, extracts PDF blobs to text, chunks + embeds into FAISS, then runs a sample similarity query and prints the top match.

Future work:
- Firebase/Firestore connector (optional deps)
- Postgres/MySQL connectors (optional deps)
- Incremental sync (watermarks, updated_at, row hashes)
- Persistence for vector stores (disk or DB)
- Endpoints to trigger ingestion
