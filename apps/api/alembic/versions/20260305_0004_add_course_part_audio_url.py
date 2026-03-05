"""Add audio_url column to course_parts table.

Revision ID: 20260305_0004
Revises: 20260305_0003
Create Date: 2026-03-05
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "20260305_0004"
down_revision: str | None = "20260305_0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("course_parts", sa.Column("audio_url", sa.String(length=1024), nullable=True))


def downgrade() -> None:
    op.drop_column("course_parts", "audio_url")
