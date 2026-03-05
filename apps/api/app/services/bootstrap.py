from app.core.config import settings
from app.core.database import SessionLocal, init_db
from app.core.migrations import run_migrations_or_stamp
from app.services.seed import ensure_usage_row, seed_reference_content


def bootstrap_application() -> None:
    if settings.db_schema_mode.lower() == "alembic":
        run_migrations_or_stamp()
    else:
        init_db()
    with SessionLocal() as db:
        seed_reference_content(db)
        ensure_usage_row(db, settings.default_user_id)
