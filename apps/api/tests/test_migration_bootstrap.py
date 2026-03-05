import sqlite3
from pathlib import Path

from app.core.config import settings
from app.core.migrations import run_migrations_or_stamp

HEAD_REVISION = "20260305_0001"


def _get_db_version(db_path: Path) -> str:
    conn = sqlite3.connect(db_path)
    try:
        return conn.execute("select version_num from alembic_version").fetchone()[0]
    finally:
        conn.close()


def test_migration_bootstrap_upgrades_empty_db(monkeypatch, tmp_path) -> None:
    db_path = tmp_path / "empty.db"
    monkeypatch.setattr(settings, "database_url", f"sqlite:///{db_path}")

    action = run_migrations_or_stamp()

    assert action == "upgrade"
    assert _get_db_version(db_path) == HEAD_REVISION


def test_migration_bootstrap_stamps_existing_db(monkeypatch, tmp_path) -> None:
    db_path = tmp_path / "existing.db"
    conn = sqlite3.connect(db_path)
    try:
        conn.execute(
            """
            CREATE TABLE courses (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                category TEXT NOT NULL,
                total_parts INTEGER NOT NULL,
                total_duration_sec INTEGER NOT NULL,
                progress_pct INTEGER NOT NULL
            )
            """
        )
        conn.commit()
    finally:
        conn.close()

    monkeypatch.setattr(settings, "database_url", f"sqlite:///{db_path}")

    action = run_migrations_or_stamp()

    assert action == "stamp"
    assert _get_db_version(db_path) == HEAD_REVISION
