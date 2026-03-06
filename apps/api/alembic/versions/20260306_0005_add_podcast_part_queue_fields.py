"""Add ordering and queue metadata to podcast_parts.

Revision ID: 20260306_0005
Revises: 20260305_0004
Create Date: 2026-03-06
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "20260306_0005"
down_revision: str | None = "20260305_0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("podcast_parts", sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("podcast_parts", sa.Column("queue_priority", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("podcast_parts", sa.Column("source_asset_id", sa.String(length=64), nullable=True))
    op.add_column("podcast_parts", sa.Column("source_slice_index", sa.Integer(), nullable=False, server_default="1"))
    op.add_column("podcast_parts", sa.Column("source_slice_total", sa.Integer(), nullable=False, server_default="1"))
    op.add_column(
        "podcast_parts",
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )
    op.create_index("ix_podcast_parts_podcast_id_sort_order", "podcast_parts", ["podcast_id", "sort_order"], unique=False)

    op.execute(
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
            sort_order = (SELECT row_num FROM ordered WHERE ordered.id = podcast_parts.id),
            source_slice_index = (SELECT row_num FROM ordered WHERE ordered.id = podcast_parts.id),
            source_slice_total = (SELECT total_parts FROM ordered WHERE ordered.id = podcast_parts.id),
            updated_at = CURRENT_TIMESTAMP
        """
    )


def downgrade() -> None:
    op.drop_index("ix_podcast_parts_podcast_id_sort_order", table_name="podcast_parts")
    op.drop_column("podcast_parts", "updated_at")
    op.drop_column("podcast_parts", "source_slice_total")
    op.drop_column("podcast_parts", "source_slice_index")
    op.drop_column("podcast_parts", "source_asset_id")
    op.drop_column("podcast_parts", "queue_priority")
    op.drop_column("podcast_parts", "sort_order")
