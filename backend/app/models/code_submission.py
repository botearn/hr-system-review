from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin


class CodeSubmission(Base, TimestampMixin):
    """面试者代码作品提交记录。

    流程：
        challenge_selected (已选题，计时开始)
          →
        pending_evaluation   (已提交，等待面试官评估)
          → evaluated        (面试官已打分)
          → (可选) timeout   (超过时限仍提交的，可单独标记)
    """

    __tablename__ = "code_submission"

    id: Mapped[int] = mapped_column(primary_key=True)

    # 提交人（interviewee）
    user_id: Mapped[int] = mapped_column(ForeignKey("user.id"), nullable=False, index=True)

    # 题目编号，目前支持 "01","02","03","04"
    challenge_id: Mapped[str] = mapped_column(String(8), nullable=False, index=True)

    # GitHub 仓库链接（选题阶段为空，提交阶段补齐）
    github_url: Mapped[str | None] = mapped_column(Text, nullable=True)

    # 关联的简历附件（可选，提交时可带）
    resume_attachment_id: Mapped[int | None] = mapped_column(
        ForeignKey("attachment.id"), nullable=True
    )

    # 简历入库后关联的候选人
    candidate_id: Mapped[int | None] = mapped_column(
        ForeignKey("candidate.id"), nullable=True, index=True
    )

    # 状态
    status: Mapped[str] = mapped_column(
        String(32), default="pending_evaluation", nullable=False, index=True
    )

    selected_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # 从选题到提交耗时（秒），可选，前端计时后上报
    time_spent_seconds: Mapped[int | None] = mapped_column(Integer)

    # 面试者提交说明
    submitter_notes: Mapped[str | None] = mapped_column(Text)

    # 评估结果（由 interviewer 填写）
    score: Mapped[float | None] = mapped_column(Numeric(5, 2))  # 0-100
    grade: Mapped[str | None] = mapped_column(String(4))         # S / A / B / C
    notes: Mapped[str | None] = mapped_column(Text)

    evaluated_by: Mapped[int | None] = mapped_column(ForeignKey("user.id"), nullable=True)
    evaluated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
