from collections.abc import Generator
from pathlib import Path

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings
from app.db.models import Base


def _build_engine():
    connect_args = {}
    if settings.database_url.startswith("sqlite"):
        connect_args = {"check_same_thread": False}
        db_path = settings.database_url.replace("sqlite:///", "")
        Path(db_path).parent.mkdir(parents=True, exist_ok=True)

    return create_engine(
        settings.database_url,
        pool_pre_ping=True,
        future=True,
        connect_args=connect_args,
    )


engine = _build_engine()
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    # Prevent race condition when api and worker boot in parallel against Postgres.
    with engine.begin() as conn:
        if engine.dialect.name == "postgresql":
            conn.execute(text("SELECT pg_advisory_lock(9152401)"))
        try:
            Base.metadata.create_all(bind=conn)
            _ensure_create_all_schema_compat(conn)
        finally:
            if engine.dialect.name == "postgresql":
                conn.execute(text("SELECT pg_advisory_unlock(9152401)"))


def _ensure_create_all_schema_compat(conn) -> None:  # noqa: ANN001
    inspector = inspect(conn)
    table_names = set(inspector.get_table_names())
    if "podcast_parts" not in table_names:
        return

    columns = {column["name"] for column in inspector.get_columns("podcast_parts")}
    indexes = {index["name"] for index in inspector.get_indexes("podcast_parts")}

    column_definitions = {
        "sort_order": "INTEGER NOT NULL DEFAULT 0",
        "queue_priority": "INTEGER NOT NULL DEFAULT 0",
        "source_asset_id": "VARCHAR(64)",
        "source_slice_index": "INTEGER NOT NULL DEFAULT 1",
        "source_slice_total": "INTEGER NOT NULL DEFAULT 1",
        "updated_at": "TIMESTAMP",
    }

    for column_name, definition in column_definitions.items():
        if column_name in columns:
            continue
        conn.execute(text(f"ALTER TABLE podcast_parts ADD COLUMN {column_name} {definition}"))

    if "ix_podcast_parts_podcast_id_sort_order" not in indexes:
        conn.execute(
            text(
                "CREATE INDEX IF NOT EXISTS ix_podcast_parts_podcast_id_sort_order "
                "ON podcast_parts (podcast_id, sort_order)"
            )
        )

    conn.execute(
        text(
            """
            WITH ordered AS (
                SELECT
                    id,
                    ROW_NUMBER() OVER (PARTITION BY podcast_id ORDER BY id) AS row_num,
                    COUNT(*) OVER (PARTITION BY podcast_id) AS total_parts
                FROM podcast_parts
            )
            UPDATE podcast_parts
            SET
                sort_order = CASE
                    WHEN sort_order IS NULL OR sort_order = 0
                        THEN (SELECT row_num FROM ordered WHERE ordered.id = podcast_parts.id)
                    ELSE sort_order
                END,
                source_slice_index = CASE
                    WHEN source_slice_index IS NULL OR source_slice_index = 0
                        THEN (SELECT row_num FROM ordered WHERE ordered.id = podcast_parts.id)
                    ELSE source_slice_index
                END,
                source_slice_total = CASE
                    WHEN source_slice_total IS NULL OR source_slice_total = 0
                        THEN (SELECT total_parts FROM ordered WHERE ordered.id = podcast_parts.id)
                    ELSE source_slice_total
                END,
                updated_at = COALESCE(updated_at, CURRENT_TIMESTAMP)
            """
        )
    )
