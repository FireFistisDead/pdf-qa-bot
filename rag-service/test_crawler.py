import sqlite3
from pathlib import Path

from crawler.agent import CrawlerAgent
from crawler.base import Record
from crawler.sqlite_connector import SQLiteConnector


def test_sqlite_connector_emits_documents(tmp_path: Path):
    db_path = tmp_path / "test.db"
    conn = sqlite3.connect(db_path)
    try:
        conn.execute("CREATE TABLE notes (id INTEGER PRIMARY KEY, title TEXT, body TEXT)")
        conn.execute("INSERT INTO notes (title, body) VALUES (?, ?)", ("hello", "world"))
        conn.commit()
    finally:
        conn.close()

    connector = SQLiteConnector(db_path=str(db_path), table="notes")
    agent = CrawlerAgent(connector=connector, source_name="sqlite")

    docs = list(agent.iter_documents())
    assert len(docs) == 1
    assert "title: hello" in docs[0].page_content
    assert "body: world" in docs[0].page_content
    assert docs[0].metadata["source"] == "sqlite"
    assert docs[0].metadata["entity"] == "notes"


def _make_minimal_pdf_bytes(text: str) -> bytes:
    # Minimal PDF with text, built with correct xref offsets to avoid parser warnings.
    stream = (
        "BT\n"
        "/F1 24 Tf\n"
        "72 72 Td\n"
        f"({text}) Tj\n"
        "ET\n"
    ).encode("ascii")

    parts: list[bytes] = []
    parts.append(b"%PDF-1.4\n")

    offsets: list[int] = [0]

    def add_obj(obj_num: int, body: bytes) -> None:
        offsets.append(sum(len(p) for p in parts))
        parts.append(f"{obj_num} 0 obj\n".encode("ascii"))
        parts.append(body)
        if not body.endswith(b"\n"):
            parts.append(b"\n")
        parts.append(b"endobj\n")

    add_obj(1, b"<< /Type /Catalog /Pages 2 0 R >>\n")
    add_obj(2, b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>\n")
    add_obj(
        3,
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 144]\n"
        b"/Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\n",
    )
    add_obj(4, b"<< /Length %d >>\nstream\n%s\nendstream\n" % (len(stream), stream))
    add_obj(5, b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\n")

    xref_offset = sum(len(p) for p in parts)
    parts.append(b"xref\n0 6\n")
    parts.append(b"0000000000 65535 f \n")
    for off in offsets[1:]:
        parts.append(f"{off:010d} 00000 n \n".encode("ascii"))
    parts.append(b"trailer\n<< /Size 6 /Root 1 0 R >>\n")
    parts.append(b"startxref\n")
    parts.append(f"{xref_offset}\n".encode("ascii"))
    parts.append(b"%%EOF\n")

    return b"".join(parts)


def test_pdf_blob_field_is_extracted_to_text(tmp_path: Path):
    pdf_bytes = _make_minimal_pdf_bytes("Hello PDF")

    class FakeConnector:
        def iter_records(self):
            yield Record(
                source="mongodb",
                entity="docs",
                record_id="1",
                fields={"pdf_bytes": pdf_bytes, "title": "example"},
            )

    agent = CrawlerAgent(connector=FakeConnector(), source_name="mongodb")
    docs = list(agent.iter_documents())

    assert len(docs) == 1
    assert "Hello PDF" in docs[0].page_content
