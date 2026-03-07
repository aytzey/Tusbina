"""Add optional course_id to podcasts for content-course linking.

Revision ID: 20260308_0008
Revises: 20260306_0007
Create Date: 2026-03-08
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "20260308_0008"
down_revision: str | None = "20260306_0007"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("podcasts", sa.Column("course_id", sa.String(length=64), nullable=True))
    op.create_index("ix_podcasts_course_id", "podcasts", ["course_id"])


def downgrade() -> None:
    op.drop_index("ix_podcasts_course_id", table_name="podcasts")
    op.drop_column("podcasts", "course_id")
