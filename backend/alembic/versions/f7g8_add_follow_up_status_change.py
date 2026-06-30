"""add follow_up + status_change

Revision ID: f7g8a0b0c0d0
Revises: e5f6a0b0c0d0
Create Date: 2026-04-29 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "f7g8a0b0c0d0"
down_revision: str | None = "e5f6a0b0c0d0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "follow_up",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("candidate_id", sa.Integer(), nullable=False),
        sa.Column("position_id", sa.Integer(), nullable=True),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("channel", sa.String(length=16), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("next_plan", sa.Text(), nullable=True),
        sa.Column("next_plan_due", sa.Date(), nullable=True),
        sa.Column("attachments", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column(
            "is_deleted",
            sa.Boolean(),
            server_default=sa.text("false"),
            nullable=False,
        ),
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
        sa.ForeignKeyConstraint(["candidate_id"], ["candidate.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["position_id"], ["position.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_follow_up_candidate_id", "follow_up", ["candidate_id"])
    op.create_index("ix_follow_up_position_id", "follow_up", ["position_id"])
    op.create_index("ix_follow_up_user_id", "follow_up", ["user_id"])
    op.create_index("ix_follow_up_next_plan_due", "follow_up", ["next_plan_due"])
    op.create_index("ix_follow_up_is_deleted", "follow_up", ["is_deleted"])

    op.create_table(
        "status_change",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("candidate_id", sa.Integer(), nullable=False),
        sa.Column("position_id", sa.Integer(), nullable=True),
        sa.Column("from_status", sa.String(length=32), nullable=True),
        sa.Column("to_status", sa.String(length=32), nullable=False),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("changed_by", sa.Integer(), nullable=False),
        sa.Column("changed_at", sa.DateTime(timezone=True), nullable=False),
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
        sa.ForeignKeyConstraint(["candidate_id"], ["candidate.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["position_id"], ["position.id"]),
        sa.ForeignKeyConstraint(["changed_by"], ["user.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_status_change_candidate_id", "status_change", ["candidate_id"])
    op.create_index("ix_status_change_position_id", "status_change", ["position_id"])


def downgrade() -> None:
    op.drop_index("ix_status_change_position_id", table_name="status_change")
    op.drop_index("ix_status_change_candidate_id", table_name="status_change")
    op.drop_table("status_change")

    op.drop_index("ix_follow_up_is_deleted", table_name="follow_up")
    op.drop_index("ix_follow_up_next_plan_due", table_name="follow_up")
    op.drop_index("ix_follow_up_user_id", table_name="follow_up")
    op.drop_index("ix_follow_up_position_id", table_name="follow_up")
    op.drop_index("ix_follow_up_candidate_id", table_name="follow_up")
    op.drop_table("follow_up")
