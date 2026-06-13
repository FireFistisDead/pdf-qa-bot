import os
import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from ocr_extractor import get_ocr_config, should_use_ocr, extract_text_with_ocr


def test_should_use_ocr_for_empty_text():
    assert should_use_ocr("", min_chars=30) is True
    assert should_use_ocr("   ", min_chars=30) is True


def test_should_not_use_ocr_for_valid_text():
    assert should_use_ocr("This PDF already has enough readable text.", min_chars=10) is False


def test_get_ocr_config_reads_environment(monkeypatch):
    monkeypatch.setenv("ENABLE_OCR_FALLBACK", "true")
    monkeypatch.setenv("OCR_MAX_PAGES", "5")
    monkeypatch.setenv("OCR_MIN_CHARS", "25")
    monkeypatch.setenv("OCR_DPI", "150")
    monkeypatch.setenv("OCR_LANGUAGE", "eng")

    config = get_ocr_config()

    assert config.enabled is True
    assert config.max_pages == 5
    assert config.min_chars == 25
    assert config.dpi == 150
    assert config.language == "eng"


def test_ocr_disabled_raises(monkeypatch):
    monkeypatch.setenv("ENABLE_OCR_FALLBACK", "false")

    with pytest.raises(RuntimeError, match="OCR fallback is disabled"):
        extract_text_with_ocr("dummy.pdf")


def test_extract_text_with_ocr_returns_documents(monkeypatch):
    monkeypatch.setenv("ENABLE_OCR_FALLBACK", "true")
    monkeypatch.setenv("OCR_MAX_PAGES", "2")
    monkeypatch.setenv("OCR_DPI", "200")
    monkeypatch.setenv("OCR_LANGUAGE", "eng")

    fake_image = MagicMock()

    with patch("pdf2image.convert_from_path", return_value=[fake_image]), \
         patch("pytesseract.image_to_string", return_value="Scanned PDF text"):
        documents = extract_text_with_ocr("dummy.pdf", filename="scan.pdf")

    assert len(documents) == 1
    assert documents[0].page_content == "Scanned PDF text"
    assert documents[0].metadata["source"] == "scan.pdf"
    assert documents[0].metadata["page"] == 1
    assert documents[0].metadata["extraction_method"] == "ocr"
