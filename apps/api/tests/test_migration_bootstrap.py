import sqlite3
from pathlib import Path

from alembic.config import Config
from alembic.script import ScriptDirectory

from app.core.config import settings
from app.core.migrations import run_migrations_or_stamp


def _get_head_revision() -> str:
    alembic_ini = Path(__file__).resolve().parents[1] / "alembic.ini"
    config = Config(str(alembic_ini))
    script = ScriptDirectory.from_config(config)
    head = script.get_current_head()
    assert head is not None
    return head


HEAD_REVISION = _get_head_revision()


def _get_db_version(db_path: Path) -> str:
    conn = sqlite3.connect(db_path)
    try:
        return conn.execute("select version_num from alembic_version").fetchone()[0]
    finally:
        conn.close()


def _get_columns(db_path: Path, table_name: str) -> set[str]:
    conn = sqlite3.connect(db_path)
    try:
        return {row[1] for row in conn.execute(f"PRAGMA table_info('{table_name}')").fetchall()}
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
        conn.execute(
            """
            CREATE TABLE course_parts (
                id TEXT PRIMARY KEY,
                course_id TEXT NOT NULL,
                title TEXT NOT NULL,
                duration_sec INTEGER NOT NULL,
                status TEXT NOT NULL,
                last_position_sec INTEGER NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE podcasts (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                source_type TEXT NOT NULL,
                voice TEXT NOT NULL,
                format TEXT NOT NULL,
                total_duration_sec INTEGER NOT NULL,
                created_at TIMESTAMP NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE podcast_parts (
                id TEXT PRIMARY KEY,
                podcast_id TEXT NOT NULL,
                title TEXT NOT NULL,
                duration_sec INTEGER NOT NULL,
                page_range TEXT NOT NULL,
                status TEXT NOT NULL,
                audio_url TEXT
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
    assert {"audio_url"} <= _get_columns(db_path, "course_parts")
    assert {"cover_image_url", "cover_image_source"} <= _get_columns(db_path, "podcasts")
    assert {
        "sort_order",
        "queue_priority",
        "source_asset_id",
        "source_slice_index",
        "source_slice_total",
        "updated_at",
    } <= _get_columns(db_path, "podcast_parts")
