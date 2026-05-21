from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Iterator, Mapping, Optional

from .base import Record


@dataclass
class MongoDBConnector:
    """
    MongoDB connector intended for unstructured "documents that may contain PDFs".

    Notes:
    - Requires optional dependency: `pymongo`
    - For PDF blobs, common patterns are:
      - Store raw bytes directly in a document field (BSON Binary → bytes in Python)
      - Store base64 text in a field
      - Store in GridFS and reference file id (future extension)
    """

    uri: str
    database: str
    collection: str
    query: Mapping[str, Any] = field(default_factory=dict)
    projection: Optional[Mapping[str, Any]] = None

    def iter_records(self) -> Iterator[Record]:
        try:
            from pymongo import MongoClient  # type: ignore
        except Exception as exc:  # pragma: no cover
            raise RuntimeError(
                "MongoDBConnector requires pymongo. Install with: pip install pymongo"
            ) from exc

        client = MongoClient(self.uri)
        try:
            coll = client[self.database][self.collection]
            cursor = coll.find(dict(self.query), self.projection)
            for doc in cursor:
                record_id = str(doc.get("_id", ""))
                fields: Mapping[str, object] = dict(doc)
                yield Record(
                    source="mongodb",
                    entity=self.collection,
                    record_id=record_id,
                    fields=fields,
                )
        finally:
            client.close()

