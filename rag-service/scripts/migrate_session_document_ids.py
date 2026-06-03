"""
One-time migration helper for sessions created before issue #321 was fixed.

Problem:
    Older versions of /process-pdf regenerated `document_id` after chunking,
    which caused:
      - FAISS chunk metadata `document_id` != session registry `documents[].document_id`
      - per-document summaries to be empty
      - citation/source mapping to fall back to filename heuristics

This script updates the persisted session registry so that each stored
`documents[].document_id` matches the single chunk-level `document_id` found in
that session's vectorstore for the same filename.

Notes:
    - Requires the RAG service dependencies installed because FAISS/Docstore
      pickles include LangChain Document objects.
    - Safe default: only migrates when the filename resolves to exactly ONE
      distinct chunk-level document_id.

Usage (from repo root):
    python rag-service/scripts/migrate_session_document_ids.py
"""

from __future__ import annotations

import json
import os
import pickle
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
RAG_DATA_DIR = REPO_ROOT / "rag-service" / "data"
SESSION_REGISTRY_FILE = RAG_DATA_DIR / "session_registry.json"


def _load_index_documents(session_dir: Path) -> list:
    index_pkl = session_dir / "index.pkl"
    if not index_pkl.exists():
        return []
    with index_pkl.open("rb") as fh:
        docstore, _index_to_docstore_id = pickle.load(fh)
    stored = getattr(docstore, "_dict", {}) or {}
    return list(stored.values())


def _migrate_entry(entry: dict, indexed_documents: list) -> int:
    """Return number of document_id fields migrated in this entry."""
    if not indexed_documents:
        return 0

    by_filename: dict[str, list] = {}
    for doc in indexed_documents:
        fname = getattr(doc, "metadata", {}).get("filename")
        if fname:
            by_filename.setdefault(fname, []).append(doc)

    migrated = 0
    documents = entry.get("documents") or []
    for uploaded in documents:
        stored_id = uploaded.get("document_id")
        fname = uploaded.get("filename")
        if not stored_id or not fname:
            continue

        if any(getattr(doc, "metadata", {}).get("document_id") == stored_id for doc in indexed_documents):
            continue

        candidates = by_filename.get(fname) or []
        candidate_ids = {
            getattr(doc, "metadata", {}).get("document_id")
            for doc in candidates
            if getattr(doc, "metadata", {}).get("document_id")
        }
        if len(candidate_ids) != 1:
            continue

        uploaded["document_id"] = next(iter(candidate_ids))
        migrated += 1

    return migrated


def main() -> int:
    if not SESSION_REGISTRY_FILE.exists():
        print(f"Session registry not found: {SESSION_REGISTRY_FILE}")
        return 1

    registry = json.loads(SESSION_REGISTRY_FILE.read_text(encoding="utf-8") or "{}")
    if not isinstance(registry, dict) or not registry:
        print("No sessions found to migrate.")
        return 0

    sessions_changed = 0
    docs_changed = 0

    for session_id, entry in registry.items():
        session_dir = entry.get("session_dir")
        if not session_dir:
            continue
        try:
            indexed_docs = _load_index_documents(Path(session_dir))
        except Exception as exc:
            print(f"[skip] failed to load index for session_id={session_id}: {exc}")
            continue

        changed = _migrate_entry(entry, indexed_docs)
        if changed:
            sessions_changed += 1
            docs_changed += changed

    if sessions_changed:
        SESSION_REGISTRY_FILE.write_text(json.dumps(registry, indent=2, sort_keys=True), encoding="utf-8")

    print(f"Migrated sessions: {sessions_changed}")
    print(f"Migrated document_id fields: {docs_changed}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

