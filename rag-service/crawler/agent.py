from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, Iterable, Iterator, List, Optional

from .base import DatabaseConnector, Record, record_to_text


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
            content = record_to_text(record)
            if not content:
                continue

            metadata = {
                "source": record.source,
                "entity": record.entity,
                "record_id": record.record_id,
            }
            yield Document(page_content=content, metadata=metadata)

