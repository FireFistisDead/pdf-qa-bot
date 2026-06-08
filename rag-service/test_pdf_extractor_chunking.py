"""Unit tests for the adaptive text chunking utility (issue #247).

These exercise the pure-text chunker in isolation — no embeddings, no
vector store, no network. They verify:
  - boundary detection preference over hard character cuts
  - sliding-window overlap between consecutive chunks
  - forward-progress guarantee (no infinite loop on pathological input)
  - argument validation
"""

import pytest

from crawler.pdf_extractor import chunk_text_with_overlap


def _build_text(sentence_count: int, sentence: str = "The quick brown fox.") -> str:
    """Build a deterministic text with N copies of a sentence."""
    return " ".join([sentence] * sentence_count)


def test_empty_input_returns_empty_list():
    assert chunk_text_with_overlap("") == []
    assert chunk_text_with_overlap("   \n  \t  ") == []
    assert chunk_text_with_overlap(None) == []  # type: ignore[arg-type]


def test_short_input_returns_single_chunk():
    text = "Short text that fits in one chunk."
    chunks = chunk_text_with_overlap(text, chunk_size=800, chunk_overlap=200)
    assert chunks == [text]


def test_long_input_is_split_into_multiple_chunks():
    text = _build_text(200)
    chunks = chunk_text_with_overlap(text, chunk_size=300, chunk_overlap=80)
    assert len(chunks) >= 2
    for chunk in chunks:
        assert chunk  # non-empty


def test_consecutive_chunks_share_overlap_region():
    """Each chunk's tail should overlap the next chunk's head by ~chunk_overlap chars."""
    text = _build_text(200)
    overlap = 80
    chunks = chunk_text_with_overlap(text, chunk_size=300, chunk_overlap=overlap)
    assert len(chunks) >= 2
    for prev, nxt in zip(chunks, chunks[1:]):
        # At least `overlap` chars of the prev chunk's tail must appear
        # in the next chunk. We tolerate trailing whitespace stripping.
        tail = prev[-overlap:].rstrip()
        assert tail[:20] in nxt, (
            f"Expected overlap tail to appear in next chunk.\n"
            f"prev tail: {tail!r}\nnext head:  {nxt[:120]!r}"
        )


def test_boundary_detection_prefers_sentence_terminator():
    """The chunk should end at a sentence boundary, not mid-sentence."""
    text = _build_text(50)
    chunks = chunk_text_with_overlap(text, chunk_size=300, chunk_overlap=60)
    # All but the final chunk should end with a sentence-terminal
    # punctuation (".", "?", "!") or a paragraph break, never a partial word.
    for chunk in chunks[:-1]:
        stripped = chunk.rstrip()
        assert stripped[-1] in ".!?", (
            f"Chunk should end at a sentence boundary, got: {stripped[-30:]!r}"
        )


def test_paragraph_breaks_take_priority_over_sentence_terminals():
    """A blank line in the lookahead should be preferred over a single period."""
    text = (
        "First paragraph. With multiple sentences. Yes really.\n\n"
        "Second paragraph. Also several. Absolutely.\n\n"
        "Third paragraph. Etc."
    )
    chunks = chunk_text_with_overlap(
        text,
        chunk_size=50,
        chunk_overlap=20,
        # Force a window where paragraph breaks exist beyond `chunk_size`.
    )
    assert len(chunks) >= 2
    # The first chunk must end on a paragraph boundary, i.e. include the
    # blank line, not slice inside "Third paragraph" early.
    assert "\n\n" in chunks[0]


def test_forward_progress_guaranteed_on_oversized_input():
    """Even with a single very long sentence, the chunker must terminate."""
    long_sentence = "x" * 5000
    chunks = chunk_text_with_overlap(
        long_sentence, chunk_size=200, chunk_overlap=50
    )
    assert len(chunks) > 1
    # No chunk should exceed `chunk_size` by more than the lookahead
    # budget (chunk_size // 2) — that proves the algorithm didn't
    # accidentally grow a single chunk to the full input length.
    for chunk in chunks:
        assert len(chunk) <= 200 + (200 // 2) + 16  # 16 = strip slack


def test_invalid_arguments_raise_value_error():
    with pytest.raises(ValueError):
        chunk_text_with_overlap("text", chunk_size=0, chunk_overlap=0)
    with pytest.raises(ValueError):
        chunk_text_with_overlap("text", chunk_size=100, chunk_overlap=-1)
    with pytest.raises(ValueError):
        chunk_text_with_overlap("text", chunk_size=100, chunk_overlap=100)
    with pytest.raises(ValueError):
        chunk_text_with_overlap("text", chunk_size=100, chunk_overlap=200)


def test_custom_boundary_patterns_are_honored():
    """A caller-provided boundary regex should override the defaults."""
    # Dense boundaries so the algorithm can land on one for every chunk.
    text = ":::".join(f"segment{i:02d}" for i in range(20))
    chunks = chunk_text_with_overlap(
        text,
        chunk_size=40,
        chunk_overlap=4,
        boundary_patterns=(r":::",),
    )
    # Every non-final chunk should end exactly at a ":::" boundary.
    for chunk in chunks[:-1]:
        assert chunk.endswith(":::"), f"Chunk did not honor custom boundary: {chunk!r}"


def test_no_overlap_when_chunk_overlap_is_zero():
    """A zero-overlap configuration should produce disjoint chunks."""
    text = _build_text(200)
    chunks = chunk_text_with_overlap(text, chunk_size=300, chunk_overlap=0)
    # Reconstruct the joined chunks and confirm the input is preserved
    # end-to-end (within whitespace stripping).
    reconstructed = "".join(chunks).replace(" ", "")
    assert reconstructed == text.replace(" ", "")
