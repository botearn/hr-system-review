"""add candidate web_profile fields

Revision ID: j1k2a0b0c0d0
Revises: h9i0a0b0c0d0
Create Date: 2026-05-24 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

from alembic import op

revision: str = "j1k2a0b0c0d0"
down_revision: str | None = "h9i0a0b0c0d0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("SET statement_timeout = 0")
    op.add_column("candidate", sa.Column("web_profile", JSONB, nullable=True))
    op.add_column(
        "candidate",
        sa.Column("web_profile_updated_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("candidate", "web_profile_updated_at")
    op.drop_column("candidate", "web_profile")
