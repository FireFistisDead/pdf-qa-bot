# Changelog

All notable changes to pdf-qa-bot will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Automated tests for Express API to prevent runtime crashes
- Relevance threshold to reduce unsupported RAG answers
- Source page references for retrieved PDF answers
- Backend validation and secure file handling
- Support for multiple PDFs within a single session

### Fixed
- fsSync ReferenceError crash on server startup
- Uploads directory creation on first run

## [1.0.0] - 2025-08-30

### Added
- PDF upload with server-side parsing and chunking
- FAISS vector indexing using sentence-transformers/all-MiniLM-L6-v2
- Question answering via semantic search and HuggingFace models
- Bullet-style document summarization
- Multi-document UI with session management
- In-browser PDF viewer using react-pdf
- Chat export as CSV or plain text
- Three-service architecture: React frontend port 3000,
  Express API gateway port 4000, FastAPI RAG service port 5000
- Environment configuration via .env.example
- CONTRIBUTING.md for contributor guidelines
