# Contributing

Thanks for contributing to **pdf-qa-bot**.

## Project Structure

- `frontend/` — React UI (CRA)
- `server.js` — Node/Express API gateway (upload + ask + summarize routes)
- `rag-service/` — FastAPI + Hugging Face RAG service

## Prerequisites

- Node.js (LTS)
- Python 3.10+
- `pip`

## Local Development

Start all three services in separate terminals.

### 1) RAG service (FastAPI)

```bash
cd rag-service
python -m pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 5000 --reload
```

### 2) Node backend

```bash
cd ..
npm install
node server.js
```

### 3) Frontend

```bash
cd frontend
npm install
npm start
```

## Branches and Commits

- Create a feature branch from `master`.
- Keep commits focused and small.
- Use clear commit messages (imperative tense), for example:
  - `fix: handle missing upload file`
  - `feat: add local HF summarization endpoint`

## Coding Guidelines

- Prefer small, targeted changes.
- Keep existing code style and naming patterns.
- Avoid hardcoding secrets/API keys.
- Add or update docs when behavior changes.

## Testing / Validation

Before opening a PR:

- Verify frontend compiles and loads.
- Verify backend starts and `/upload`, `/ask`, and `/summarize` work end-to-end.
- Check FastAPI logs for runtime errors.

## Pull Requests

Please include:

- What changed
- Why it changed
- How you tested it
- Any screenshots (if UI changes)

## Security Notes

- Never commit real credentials in code or `.env`.
- Use environment variables for model/API config.
