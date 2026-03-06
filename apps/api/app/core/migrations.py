from pathlib import Path
from typing import Literal

from alembic.config import Config
from sqlalchemy import create_engine, inspect, text

from alembic import command
from app.core.config import settings
from app.core.schema_compat import ensure_legacy_schema_compat

MigrationAction = Literal["upgrade", "stamp"]

_APP_TABLES = {
    "courses",
    "course_parts",
    "podcasts",
    "podcast_parts",
    "podcast_user_state",
    "upload_assets",
    "generation_jobs",
    "feedback",
    "usage",
}
_PG_MIGRATION_LOCK_KEY = 9152402


def run_migrations_or_stamp() -> MigrationAction:
    """Bootstrap database schema using Alembic in a backwards-compatible way.

    If an existing schema exists without `alembic_version`, we stamp head
    to avoid breaking old local environments initialized with `create_all`.
    """
    database_url = settings.database_url
    engine = create_engine(database_url, pool_pre_ping=True, future=True)

    alembic_ini = Path(__file__).resolve().parents[2] / "alembic.ini"
    config = Config(str(alembic_ini))
    config.set_main_option("sqlalchemy.url", database_url)

    with engine.connect() as connection:
        is_postgres = engine.dialect.name == "postgresql"
        if is_postgres:
            connection.execute(text(f"SELECT pg_advisory_lock({_PG_MIGRATION_LOCK_KEY})"))
        try:
            table_names = set(inspect(connection).get_table_names())
            config.attributes["connection"] = connection
            if "alembic_version" in table_names or table_names.intersection(_APP_TABLES):
                ensure_legacy_schema_compat(connection)
                table_names = set(inspect(connection).get_table_names())

            if "alembic_version" in table_names:
                command.upgrade(config, "head")
                action: MigrationAction = "upgrade"
            elif table_names.intersection(_APP_TABLES):
                command.stamp(config, "head")
                action = "stamp"
            else:
                command.upgrade(config, "head")
                action = "upgrade"

            connection.commit()
            return action
        finally:
            if is_postgres:
                connection.execute(text(f"SELECT pg_advisory_unlock({_PG_MIGRATION_LOCK_KEY})"))
