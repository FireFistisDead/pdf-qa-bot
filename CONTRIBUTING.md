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

## Issues and labels

Use the GitHub issue forms for bug reports, feature requests, and fix requests.

- Bug reports go through the bug form and get the `bug` label.
- Feature requests go through the feature form and get the `feature` label.
- Fix requests go through the fix form and get the `fix` label.

The repository also includes an auto-label workflow in `.github/workflows/auto-label.yml`.
Edit `.github/label-rules.json` to customize label names, colors, descriptions, keywords, and file-path rules.

## Security Notes

- Never commit real credentials in code or `.env`.
- Use environment variables for model/API config.
