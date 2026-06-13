import os
from dataclasses import dataclass
from typing import List

from langchain_core.documents import Document


@dataclass(frozen=True)
class OCRConfig:
    enabled: bool
    max_pages: int
    min_chars: int
    dpi: int
    language: str


def get_ocr_config() -> OCRConfig:
    return OCRConfig(
        enabled=os.getenv("ENABLE_OCR_FALLBACK", "false").lower() == "true",
        max_pages=int(os.getenv("OCR_MAX_PAGES", "10")),
        min_chars=int(os.getenv("OCR_MIN_CHARS", "30")),
        dpi=int(os.getenv("OCR_DPI", "200")),
        language=os.getenv("OCR_LANGUAGE", "eng"),
    )


def should_use_ocr(extracted_text: str, min_chars: int) -> bool:
    cleaned = (extracted_text or "").strip()
    return len(cleaned) < min_chars


def extract_text_with_ocr(pdf_path: str, filename: str = "uploaded.pdf") -> List[Document]:
    config = get_ocr_config()

    if not config.enabled:
        raise RuntimeError("OCR fallback is disabled. Set ENABLE_OCR_FALLBACK=true to enable it.")

    try:
        from pdf2image import convert_from_path
        import pytesseract
    except ImportError as exc:
        raise RuntimeError(
            "OCR dependencies are missing. Install pdf2image, pytesseract, tesseract-ocr, and poppler-utils."
        ) from exc

    images = convert_from_path(
        pdf_path,
        dpi=config.dpi,
        first_page=1,
        last_page=config.max_pages,
    )

    documents: List[Document] = []

    for index, image in enumerate(images, start=1):
        text = pytesseract.image_to_string(image, lang=config.language).strip()

        if not text:
            continue

        documents.append(
            Document(
                page_content=text,
                metadata={
                    "source": filename,
                    "page": index,
                    "extraction_method": "ocr",
                },
            )
        )

    if not documents:
        raise RuntimeError("OCR fallback ran but no readable text was detected.")

    return documents
