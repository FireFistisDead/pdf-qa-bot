from __future__ import annotations

import sqlite3
from dataclasses import dataclass
from typing import Iterator, Mapping

from .base import Record


def _validate_identifier(name: str, label: str) -> str:
    if not name or not isinstance(name, str):
        raise ValueError(f"{label} must be a non-empty string")
    if not name.replace("_", "").isalnum():
        raise ValueError(f"{label} contains unsupported characters: {name!r}")
    return name


@dataclass
class SQLiteConnector:
    db_path: str
    table: str
    id_column: str = "id"

    def iter_records(self) -> Iterator[Record]:
        table = _validate_identifier(self.table, "table")
        id_column = _validate_identifier(self.id_column, "id_column")

        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        try:
            cursor = conn.execute(f"SELECT * FROM {table}")  # nosec B608
            for row in cursor:
                fields: Mapping[str, object] = dict(row)
                record_id = str(fields.get(id_column, ""))
                yield Record(
                    source="sqlite",
                    entity=table,
                    record_id=record_id,
                    fields=fields,
                )
        finally:
            conn.close()
