"""Initial schema for TUSBINA MVP backend.

Revision ID: 20260305_0001
Revises:
Create Date: 2026-03-05
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "20260305_0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "courses",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("category", sa.String(length=128), nullable=False),
        sa.Column("total_parts", sa.Integer(), nullable=False),
        sa.Column("total_duration_sec", sa.Integer(), nullable=False),
        sa.Column("progress_pct", sa.Integer(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "feedback",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("user_id", sa.String(length=64), nullable=False),
        sa.Column("rating", sa.Integer(), nullable=False),
        sa.Column("tags_json", sa.JSON(), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("content_id", sa.String(length=64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_feedback_user_id", "feedback", ["user_id"], unique=False)

    op.create_table(
        "generation_jobs",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("user_id", sa.String(length=64), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("progress_pct", sa.Integer(), nullable=False),
        sa.Column("payload_json", sa.JSON(), nullable=False),
        sa.Column("result_podcast_id", sa.String(length=64), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_generation_jobs_status", "generation_jobs", ["status"], unique=False)
    op.create_index("ix_generation_jobs_user_id", "generation_jobs", ["user_id"], unique=False)

    op.create_table(
        "podcasts",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("user_id", sa.String(length=64), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("source_type", sa.String(length=32), nullable=False),
        sa.Column("voice", sa.String(length=64), nullable=False),
        sa.Column("format", sa.String(length=32), nullable=False),
        sa.Column("total_duration_sec", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_podcasts_user_id", "podcasts", ["user_id"], unique=False)

    op.create_table(
        "upload_assets",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("user_id", sa.String(length=64), nullable=False),
        sa.Column("filename", sa.String(length=255), nullable=False),
        sa.Column("content_type", sa.String(length=128), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        sa.Column("storage_key", sa.String(length=1024), nullable=False),
        sa.Column("public_url", sa.String(length=1024), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_upload_assets_user_id", "upload_assets", ["user_id"], unique=False)

    op.create_table(
        "usage",
        sa.Column("user_id", sa.String(length=64), nullable=False),
        sa.Column("monthly_listen_quota_sec", sa.Integer(), nullable=False),
        sa.Column("monthly_used_sec", sa.Integer(), nullable=False),
        sa.Column("is_premium", sa.Boolean(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("user_id"),
    )

    op.create_table(
        "course_parts",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("course_id", sa.String(length=64), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("duration_sec", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("last_position_sec", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["course_id"], ["courses.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_course_parts_course_id", "course_parts", ["course_id"], unique=False)

    op.create_table(
        "podcast_parts",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("podcast_id", sa.String(length=64), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("duration_sec", sa.Integer(), nullable=False),
        sa.Column("page_range", sa.String(length=64), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("audio_url", sa.String(length=1024), nullable=True),
        sa.ForeignKeyConstraint(["podcast_id"], ["podcasts.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_podcast_parts_podcast_id", "podcast_parts", ["podcast_id"], unique=False)

    op.create_table(
        "podcast_user_state",
        sa.Column("user_id", sa.String(length=64), nullable=False),
        sa.Column("podcast_id", sa.String(length=64), nullable=False),
        sa.Column("is_favorite", sa.Boolean(), nullable=False),
        sa.Column("is_downloaded", sa.Boolean(), nullable=False),
        sa.Column("progress_sec", sa.Integer(), nullable=False),
        sa.Column("last_listened_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["podcast_id"], ["podcasts.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("user_id", "podcast_id"),
    )
    op.create_index("ix_podcast_user_state_podcast_id", "podcast_user_state", ["podcast_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_podcast_user_state_podcast_id", table_name="podcast_user_state")
    op.drop_table("podcast_user_state")

    op.drop_index("ix_podcast_parts_podcast_id", table_name="podcast_parts")
    op.drop_table("podcast_parts")

    op.drop_index("ix_course_parts_course_id", table_name="course_parts")
    op.drop_table("course_parts")

    op.drop_table("usage")

    op.drop_index("ix_upload_assets_user_id", table_name="upload_assets")
    op.drop_table("upload_assets")

    op.drop_index("ix_podcasts_user_id", table_name="podcasts")
    op.drop_table("podcasts")

    op.drop_index("ix_generation_jobs_user_id", table_name="generation_jobs")
    op.drop_index("ix_generation_jobs_status", table_name="generation_jobs")
    op.drop_table("generation_jobs")

    op.drop_index("ix_feedback_user_id", table_name="feedback")
    op.drop_table("feedback")

    op.drop_table("courses")
