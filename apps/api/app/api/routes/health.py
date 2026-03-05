from fastapi import APIRouter
from sqlalchemy import text

from app.core.config import settings
from app.core.database import engine

router = APIRouter(tags=["health"])


@router.get("/health")
def health() -> dict[str, str | bool]:
    db_status = "down"
    db_revision = "unknown"

    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
            db_status = "up"
            try:
                db_revision_row = conn.execute(text("SELECT version_num FROM alembic_version LIMIT 1")).fetchone()
                if db_revision_row and db_revision_row[0]:
                    db_revision = str(db_revision_row[0])
            except Exception:
                # `create_all` mode may not have alembic_version table yet.
                db_revision = "n/a"
    except Exception:
        db_status = "down"

    return {
        "status": "ok",
        "service": "tusbina-api",
        "version": "0.2.0",
        "db_schema_mode": settings.db_schema_mode,
        "db_status": db_status,
        "db_revision": db_revision,
        "storage_backend": settings.storage_backend,
        "tts_provider": settings.tts_provider,
    }
