from collections.abc import Generator
from pathlib import Path

from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings
from app.core.schema_compat import ensure_legacy_schema_compat
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
            ensure_legacy_schema_compat(conn)
        finally:
            if engine.dialect.name == "postgresql":
                conn.execute(text("SELECT pg_advisory_unlock(9152401)"))
