"""Add user_legal_consents table.

Revision ID: 20260306_0007
Revises: 20260306_0006
Create Date: 2026-03-06
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "20260306_0007"
down_revision: str | None = "20260306_0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "user_legal_consents",
        sa.Column("user_id", sa.String(length=64), nullable=False),
        sa.Column("privacy_policy_version", sa.String(length=32), nullable=True),
        sa.Column("terms_of_use_version", sa.String(length=32), nullable=True),
        sa.Column("kvkk_notice_version", sa.String(length=32), nullable=True),
        sa.Column("required_consents_accepted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("marketing_opt_in", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("marketing_consent_version", sa.String(length=32), nullable=True),
        sa.Column("marketing_consent_updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("user_id"),
    )


def downgrade() -> None:
    op.drop_table("user_legal_consents")
