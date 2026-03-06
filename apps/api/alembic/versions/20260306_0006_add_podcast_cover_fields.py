"""Add cover image metadata to podcasts.

Revision ID: 20260306_0006
Revises: 20260306_0005
Create Date: 2026-03-06
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "20260306_0006"
down_revision: str | None = "20260306_0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("podcasts", sa.Column("cover_image_url", sa.String(length=1024), nullable=True))
    op.add_column("podcasts", sa.Column("cover_image_source", sa.String(length=32), nullable=True))


def downgrade() -> None:
    op.drop_column("podcasts", "cover_image_source")
    op.drop_column("podcasts", "cover_image_url")
