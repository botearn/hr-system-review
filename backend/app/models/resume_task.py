from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin


class ResumeTask(Base, TimestampMixin):
    """简历解析任务。

    状态流转：
        pending
          → parsing (文本提取)
          → extracting (LLM 结构化抽取)
          → deriving_capabilities (LLM 能力提炼)
          → scoring_quality (LLM 简历质量评分)
          → ready_to_confirm (等待顾问确认)
          → confirmed (顾问已确认，已生成 candidate)
          → failed (任何步骤失败)
    """

    __tablename__ = "resume_task"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("user.id"), nullable=False, index=True)
    file_id: Mapped[int | None] = mapped_column(ForeignKey("attachment.id"))

    source_type: Mapped[str] = mapped_column(
        String(16), nullable=False
    )  # upload / url_pdf / url_html
    source_url: Mapped[str | None] = mapped_column(String(1024))

    status: Mapped[str] = mapped_column(String(32), default="pending", nullable=False, index=True)

    resume_text: Mapped[str | None] = mapped_column(Text)
    extracted: Mapped[dict | None] = mapped_column(JSONB)
    derived_capabilities: Mapped[list | None] = mapped_column(JSONB)
    resume_quality: Mapped[dict | None] = mapped_column(JSONB)

    candidate_id: Mapped[int | None] = mapped_column(ForeignKey("candidate.id"), index=True)

    error_msg: Mapped[str | None] = mapped_column(Text)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
