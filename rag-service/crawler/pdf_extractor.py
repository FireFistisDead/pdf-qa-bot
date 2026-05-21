from __future__ import annotations

import base64
import io
from typing import Mapping, Optional


def maybe_decode_pdf_bytes(fields: Mapping[str, object]) -> Optional[bytes]:
    """
    Best-effort extraction of PDF bytes from an unstructured record.

    Supported shapes:
    - bytes/bytearray/memoryview in a field named like "pdf", "pdf_bytes", "document", etc.
    - base64-encoded string in a field named like "pdf_base64", "pdf", etc.

    This is intentionally heuristic so MongoDB/Firestore-style documents can work
    without rigid schemas.
    """
    candidate_keys = [
        "pdf_bytes",
        "pdf",
        "document",
        "file",
        "blob",
        "attachment",
        "content",
        "data",
        "pdf_base64",
    ]

    for key in candidate_keys:
        if key not in fields:
            continue

        value = fields.get(key)
        if isinstance(value, bytes):
            return value
        if isinstance(value, bytearray):
            return bytes(value)
        if isinstance(value, memoryview):
            return value.tobytes()
        if isinstance(value, str):
            text = value.strip()
            if not text:
                continue
            try:
                return base64.b64decode(text, validate=True)
            except Exception:
                continue

    return None


def extract_pdf_text(
    pdf_bytes: bytes,
    *,
    max_pages: int = 50,
    max_chars: int = 250_000,
) -> str:
    """
    Extract text from PDF bytes using pypdf.

    Limits are defensive to keep ingestion bounded for very large PDFs.
    """
    from pypdf import PdfReader  # local import to keep module import-light

    reader = PdfReader(io.BytesIO(pdf_bytes))

    chunks: list[str] = []
    for idx, page in enumerate(reader.pages):
        if idx >= max_pages:
            break
        text = page.extract_text() or ""
        if text:
            chunks.append(text)
        if sum(len(c) for c in chunks) >= max_chars:
            break

    return "\n".join(chunks).strip()

