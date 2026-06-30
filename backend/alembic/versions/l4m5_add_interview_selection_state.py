"""add interview selection state

Revision ID: l4m5a0b0c0d0
Revises: k3l4a0b0c0d0
Create Date: 2026-06-30
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "l4m5a0b0c0d0"
down_revision: str | None = "k3l4a0b0c0d0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("code_submission", sa.Column("selected_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("code_submission", sa.Column("submitter_notes", sa.Text(), nullable=True))
    op.alter_column("code_submission", "github_url", existing_type=sa.Text(), nullable=True)
    op.alter_column(
        "code_submission",
        "submitted_at",
        existing_type=sa.DateTime(timezone=True),
        nullable=True,
    )


def downgrade() -> None:
    op.execute("UPDATE code_submission SET github_url = '' WHERE github_url IS NULL")
    op.execute("UPDATE code_submission SET submitted_at = COALESCE(submitted_at, selected_at, NOW())")
    op.alter_column(
        "code_submission",
        "submitted_at",
        existing_type=sa.DateTime(timezone=True),
        nullable=False,
    )
    op.alter_column("code_submission", "github_url", existing_type=sa.Text(), nullable=False)
    op.drop_column("code_submission", "submitter_notes")
    op.drop_column("code_submission", "selected_at")
