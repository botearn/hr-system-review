"""add code_submission table (interview platform)

Revision ID: k3l4a0b0c0d0
Revises: j1k2a0b0c0d0
Create Date: 2026-06-30
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "k3l4a0b0c0d0"
down_revision: str | None = "j1k2a0b0c0d0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "code_submission",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("challenge_id", sa.String(length=8), nullable=False),
        sa.Column("github_url", sa.Text(), nullable=False),
        sa.Column("resume_attachment_id", sa.Integer(), nullable=True),
        sa.Column("candidate_id", sa.Integer(), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="pending_evaluation"),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("time_spent_seconds", sa.Integer(), nullable=True),
        sa.Column("score", sa.Numeric(precision=5, scale=2), nullable=True),
        sa.Column("grade", sa.String(length=4), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("evaluated_by", sa.Integer(), nullable=True),
        sa.Column("evaluated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"]),
        sa.ForeignKeyConstraint(["resume_attachment_id"], ["attachment.id"]),
        sa.ForeignKeyConstraint(["candidate_id"], ["candidate.id"]),
        sa.ForeignKeyConstraint(["evaluated_by"], ["user.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_code_submission_user_id"), "code_submission", ["user_id"], unique=False)
    op.create_index(op.f("ix_code_submission_challenge_id"), "code_submission", ["challenge_id"], unique=False)
    op.create_index(op.f("ix_code_submission_candidate_id"), "code_submission", ["candidate_id"], unique=False)
    op.create_index(op.f("ix_code_submission_status"), "code_submission", ["status"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_code_submission_status"), table_name="code_submission")
    op.drop_index(op.f("ix_code_submission_candidate_id"), table_name="code_submission")
    op.drop_index(op.f("ix_code_submission_challenge_id"), table_name="code_submission")
    op.drop_index(op.f("ix_code_submission_user_id"), table_name="code_submission")
    op.drop_table("code_submission")
