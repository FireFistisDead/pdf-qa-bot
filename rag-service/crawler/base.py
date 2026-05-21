from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, Iterable, Iterator, Mapping, Optional, Protocol


@dataclass(frozen=True)
class Record:
    source: str
    entity: str
    record_id: str
    fields: Mapping[str, object]


class DatabaseConnector(Protocol):
    def iter_records(self) -> Iterator[Record]:
        ...


def safe_str(value: object, max_len: int = 4000) -> str:
    if isinstance(value, (bytes, bytearray, memoryview)):
        size = len(value)  # type: ignore[arg-type]
        return f"[binary {size} bytes]"
    text = "" if value is None else str(value)
    if len(text) > max_len:
        return text[: max_len - 3] + "..."
    return text


def record_to_text(record: Record, field_order: Optional[Iterable[str]] = None) -> str:
    keys = list(record.fields.keys())
    if field_order:
        ordered = [k for k in field_order if k in record.fields]
        unordered = [k for k in keys if k not in ordered]
        keys = ordered + unordered

    lines = [f"{k}: {safe_str(record.fields.get(k))}" for k in keys]
    return "\n".join(lines).strip()
