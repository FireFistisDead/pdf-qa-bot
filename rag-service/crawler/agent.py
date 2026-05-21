from __future__ import annotations

from dataclasses import dataclass
from typing import Iterator

from .base import DatabaseConnector, record_to_text
from .pdf_extractor import extract_pdf_text, maybe_decode_pdf_bytes


try:
    from langchain_core.documents import Document  # type: ignore
except Exception:  # pragma: no cover
    from langchain.schema import Document  # type: ignore


@dataclass
class CrawlerAgent:
    connector: DatabaseConnector
    source_name: str

    def iter_documents(self) -> Iterator[Document]:
        for record in self.connector.iter_records():
            pdf_bytes = maybe_decode_pdf_bytes(record.fields)
            if pdf_bytes is not None:
                content = extract_pdf_text(pdf_bytes)
            else:
                content = record_to_text(record)
            if not content:
                continue

            metadata = {
                "source": record.source,
                "entity": record.entity,
                "record_id": record.record_id,
            }
            yield Document(page_content=content, metadata=metadata)
