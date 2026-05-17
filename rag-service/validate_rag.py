#!/usr/bin/env python3
"""Lightweight smoke checks for the RAG /ask pipeline."""

import argparse
import sys

import requests

DEFAULT_BASE = "http://localhost:5000"


def run_checks(base_url: str, session_id: str) -> int:
    failures = 0

    in_scope = requests.post(
        f"{base_url}/ask",
        json={"question": "What is this document about?", "session_id": session_id},
        timeout=120,
    )
    if not in_scope.ok:
        print(f"FAIL in-scope ask: HTTP {in_scope.status_code}")
        failures += 1
    else:
        body = in_scope.json()
        print(f"OK in-scope answer length={len(body.get('answer', ''))}")
        if body.get("sources") is not None:
            print(f"  sources={body.get('sources')}")

    off_topic = requests.post(
        f"{base_url}/ask",
        json={
            "question": "What is the capital of France in 1800?",
            "session_id": session_id,
        },
        timeout=120,
    )
    if not off_topic.ok:
        print(f"FAIL off-topic ask: HTTP {off_topic.status_code}")
        failures += 1
    else:
        answer = off_topic.json().get("answer", "")
        if "does not appear to contain" in answer.lower():
            print("OK off-topic rejected by relevance threshold")
        else:
            print(f"WARN off-topic may not be filtered: {answer[:120]}...")

    return failures


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate pdf-qa-bot RAG responses")
    parser.add_argument("--base-url", default=DEFAULT_BASE)
    parser.add_argument("--session-id", required=True, help="Active session_id from /process-pdf")
    args = parser.parse_args()
    return run_checks(args.base_url, args.session_id)


if __name__ == "__main__":
    sys.exit(main())
