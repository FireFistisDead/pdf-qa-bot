# PDF Q&A Bot

RAG-based PDF question-answering app with:

- **Frontend**: React app (`frontend/`)
- **Backend API**: Node + Express (`server.js`)
- **RAG Service**: FastAPI + Hugging Face + FAISS (`rag-service/`)

Upload a PDF, ask questions from its content, and generate a short summary.

## Architecture

1. Frontend uploads file to Node backend (`/upload`)
2. Node forwards file path to FastAPI (`/process-pdf`)
3. FastAPI loads/splits PDF, builds vector index with embeddings
4. For `/ask` and `/summarize`, FastAPI retrieves relevant chunks and generates output with a Hugging Face model

## Project Structure

```text
.
├── frontend/           # React UI
├── rag-service/        # FastAPI RAG service
├── server.js           # Node API gateway
├── uploads/            # Uploaded files (runtime)
└── CONTRIBUTING.md
```

## Prerequisites

- Node.js 18+ (LTS recommended)
- Python 3.10+
- `pip`

## 1) Clone and Install Dependencies

From repository root:

```bash
npm install
cd frontend && npm install
cd ../rag-service && python -m pip install -r requirements.txt
```

## 2) Environment Variables

Create `.env` in repo root (or edit existing):

```env
# Optional model override
HF_GENERATION_MODEL=google/flan-t5-base
```

Notes:

- `OPENAI_API_KEY` is not required for current Hugging Face RAG flow.
- Keep real secrets out of git.

## 3) Run the App (3 terminals)

### Terminal A — RAG service (port 5000)

```bash
cd rag-service
uvicorn main:app --host 0.0.0.0 --port 5000 --reload
```

### Terminal B — Node backend (port 4000)

```bash
cd /workspaces/pdf-qa-bot
node server.js
```

### Terminal C — Frontend (port 3000)

```bash
cd /workspaces/pdf-qa-bot/frontend
npm start
```

Open: `http://localhost:3000`

## API Endpoints

Node backend (`http://localhost:4000`):

- `POST /upload` (multipart form-data, field: `file`)
- `POST /ask` (`{ "question": "..." }`)
- `POST /summarize` (`{}`)

FastAPI RAG service (`http://localhost:5000`):

- `POST /process-pdf`
- `POST /ask`
- `POST /summarize`

Interactive docs: `http://localhost:5000/docs`

## Troubleshooting

- **`Cannot POST /upload` from frontend**
	- Restart frontend dev server after config changes: `npm start`
	- Ensure Node backend is running on port `4000`

- **Upload fails / connection refused**
	- Ensure FastAPI is running on port `5000`

- **Slow first request**
	- Hugging Face model downloads on first run (can take time)

- **Port already in use**
	- Stop old processes or change ports consistently in frontend/backend/service

## Development Notes

- Uploaded files are stored in `uploads/`
- RAG index is in-memory (rebuilds after restart)
- Summarization and QA use retrieved context from the last processed PDF

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).
