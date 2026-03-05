"""Add quiz_questions table for TUS-style quiz generation.

Revision ID: 20260305_0002
Revises: 20260305_0001
Create Date: 2026-03-05
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "20260305_0002"
down_revision: str | None = "20260305_0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "quiz_questions",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("podcast_id", sa.String(length=64), nullable=False),
        sa.Column("user_id", sa.String(length=64), nullable=False),
        sa.Column("category", sa.String(length=128), nullable=False),
        sa.Column("question", sa.Text(), nullable=False),
        sa.Column("options", sa.JSON(), nullable=False),
        sa.Column("correct_index", sa.Integer(), nullable=False),
        sa.Column("explanation", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["podcast_id"], ["podcasts.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_quiz_questions_podcast_id", "quiz_questions", ["podcast_id"], unique=False)
    op.create_index("ix_quiz_questions_user_id", "quiz_questions", ["user_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_quiz_questions_user_id", table_name="quiz_questions")
    op.drop_index("ix_quiz_questions_podcast_id", table_name="quiz_questions")
    op.drop_table("quiz_questions")
