import sqlite3
from pathlib import Path

from crawler.agent import CrawlerAgent
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

