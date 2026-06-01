from __future__ import annotations

import base64
import io
import re
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


# Patterns marking natural boundary points, in priority order:
#   1. Paragraph break (blank line) — preferred split
#   2. Sentence terminal (`.`, `?`, `!` followed by whitespace)
# The boundary search walks right-to-left within a lookahead window so the
# chunk ends as close to `chunk_size` as possible without slicing a sentence.
# NB: `\s` includes `\n`, so a naive `\n\s*\n` will greedily eat the second
# newline — use a literal `\n{2,}` for a blank-line break instead.
_DEFAULT_BOUNDARY_PATTERNS: tuple[str, ...] = (
    r"\n{2,}",
    r"(?<=[.!?])\s+",
)


def chunk_text_with_overlap(
    text: str,
    *,
    chunk_size: int = 800,
    chunk_overlap: int = 200,
    boundary_patterns: tuple[str, ...] = _DEFAULT_BOUNDARY_PATTERNS,
) -> list[str]:
    """
    Split text into chunks with a sliding overlap of ``chunk_overlap``
    characters, preferring natural sentence/paragraph boundaries over
    hard character-count cuts so the vector store can preserve
    cross-boundary context.

    The algorithm walks the text in ``chunk_size`` windows. For each
    window it searches *forward* in a ``chunk_size // 2`` lookahead for
    the latest natural boundary and extends the chunk end to that
    boundary when one is found; otherwise it cuts at exactly
    ``chunk_size``. The next chunk starts ``chunk_overlap`` characters
    before the end of the previous one, so consecutive chunks share a
    tail of approximately ``chunk_overlap`` characters.

    **Sizing semantics.** ``chunk_size`` is a *soft target*, not a hard
    cap. Because the boundary search extends the chunk end forward (not
    backward), a chunk that finds a boundary just past ``chunk_size``
    will be extended to that boundary, making the actual chunk size up
    to ``chunk_size + chunk_size // 2`` characters. This is a deliberate
    trade-off: extending forward keeps the chunk's *start* aligned with
    ``chunk_size`` (so the start of each chunk falls on a roughly
    regular cadence, which downstream code can rely on) while still
    snapping the *end* to a natural break. Callers that need a hard
    cap should post-process the output to split any chunk that exceeds
    the desired maximum.

    This is a pure-text utility with no embeddings or vector-store
    dependency, so it can be exercised in isolation.

    Args:
        text: Input text to split. ``None``, empty, or whitespace-only
            inputs return an empty list.
        chunk_size: Soft target for chunk size in characters. Actual
            chunks may reach ``chunk_size + chunk_size // 2`` when a
            natural boundary is found in the lookahead. Must be > 0.
        chunk_overlap: Characters of overlap between consecutive chunks.
            Must satisfy ``0 <= chunk_overlap < chunk_size`` so each
            iteration makes forward progress.
        boundary_patterns: Regex patterns marking natural boundary
            points, in priority order. The chunk's end is extended to
            the latest match within a ``chunk_size // 2`` lookahead so
            the chunk stays close to the target size.

    Returns:
        List of non-empty stripped text chunks. The first chunk starts
        at the beginning of the input; the last chunk absorbs any
        remaining text up to the end of the input.

    Raises:
        ValueError: If ``chunk_size <= 0``, ``chunk_overlap < 0``, or
            ``chunk_overlap >= chunk_size``.

    Example:
        >>> chunks = chunk_text_with_overlap(
        ...     "Sentence one. Sentence two. " * 100,
        ...     chunk_size=300,
        ...     chunk_overlap=80,
        ... )
        >>> len(chunks) >= 2
        True
    """
    if not text or not text.strip():
        return []
    if chunk_size <= 0:
        raise ValueError(f"chunk_size must be > 0, got {chunk_size}")
    if chunk_overlap < 0:
        raise ValueError(f"chunk_overlap must be >= 0, got {chunk_overlap}")
    if chunk_overlap >= chunk_size:
        raise ValueError(
            f"chunk_overlap ({chunk_overlap}) must be < chunk_size ({chunk_size})"
        )

    chunks: list[str] = []
    start = 0
    text_len = len(text)
    lookahead_max = max(chunk_size // 2, 1)
    # Pre-compile boundary patterns for the lifetime of the call.
    compiled = [re.compile(p) for p in boundary_patterns]

    while start < text_len:
        naive_end = start + chunk_size
        if naive_end >= text_len:
            # Last chunk — absorb the remaining tail verbatim.
            chunk_end = text_len
        else:
            chunk_end = naive_end
            window_end = min(naive_end + lookahead_max, text_len)
            # Walk boundary patterns in priority order; the first pattern
            # that yields a match wins, but we always pick the latest
            # match within the lookahead so the chunk stays close to
            # `chunk_size` characters.
            best_offset = -1
            for pattern in compiled:
                for match in pattern.finditer(text, naive_end, window_end):
                    offset = match.end() - start
                    if offset > best_offset:
                        best_offset = offset
                if best_offset > 0:
                    break
            if best_offset > 0:
                chunk_end = start + best_offset

        # `lstrip` only the start so the natural boundary we just snapped
        # to (e.g. a trailing `\n\n` paragraph break) is preserved verbatim.
        # Stripping the end would erase the very signal we used to align
        # the chunk and would also make overlapping tails diverge from the
        # original text.
        chunk = text[start:chunk_end].lstrip()
        if chunk:
            chunks.append(chunk)

        if chunk_end >= text_len:
            break

        # Next chunk starts `chunk_overlap` characters back from the end
        # of the current chunk so the tail of the current chunk becomes
        # the head of the next. Guarantee forward progress even on
        # pathological inputs by stepping at least one character.
        start = max(chunk_end - chunk_overlap, start + 1)

    return chunks

