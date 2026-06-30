from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin


class FollowUp(Base, TimestampMixin):
    """每一次与候选人的沟通记录。可关联具体岗位（推送/面试上下文），也可不关联。"""

    __tablename__ = "follow_up"

    id: Mapped[int] = mapped_column(primary_key=True)
    candidate_id: Mapped[int] = mapped_column(
        ForeignKey("candidate.id", ondelete="CASCADE"), nullable=False, index=True
    )
    position_id: Mapped[int | None] = mapped_column(ForeignKey("position.id"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("user.id"), nullable=False, index=True)

    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    channel: Mapped[str] = mapped_column(String(16), nullable=False)
    # phone / wechat / email / in_person / other

    content: Mapped[str] = mapped_column(Text, nullable=False)
    next_plan: Mapped[str | None] = mapped_column(Text)
    next_plan_due: Mapped[date | None] = mapped_column(Date, index=True)

    attachments: Mapped[list | None] = mapped_column(JSONB)
    # [{"file_id": int, "filename": str}, ...]

    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, index=True)


class StatusChange(Base, TimestampMixin):
    """候选人跟进状态的变更记录。

    预设状态枚举（在 STATUSES 里）：
      initial_contact         初步沟通
      resume_pushed           简历已推送
      interview_scheduled     面试安排中
      interview_1_passed      一面通过
      interview_2_passed      二面通过
      offer_sent              Offer 发放
      onboarded               已入职
      rejected_1              一面淘汰
      rejected_2              二面淘汰
      declined_offer          候选人拒绝 Offer
      dropped                 流失

    与 candidate.job_status 的关系:
      to_status='onboarded'  → 同步设 candidate.job_status='onboarded'
      to_status∈{'dropped','declined_offer'} 且 cand 已 onboarded
                             → 回滚 candidate.job_status='active'
      详见 app/models/candidate.py 顶部说明。
    """

    __tablename__ = "status_change"

    id: Mapped[int] = mapped_column(primary_key=True)
    candidate_id: Mapped[int] = mapped_column(
        ForeignKey("candidate.id", ondelete="CASCADE"), nullable=False, index=True
    )
    position_id: Mapped[int | None] = mapped_column(ForeignKey("position.id"), index=True)

    from_status: Mapped[str | None] = mapped_column(String(32))
    to_status: Mapped[str] = mapped_column(String(32), nullable=False)

    reason: Mapped[str | None] = mapped_column(Text)

    # 候选人去向 (destination):
    #   to_status='onboarded'                    → 必填
    #   to_status∈{'dropped','declined_offer'}   → 选填，记录已知去向
    outcome_company: Mapped[str | None] = mapped_column(String(200))
    outcome_role: Mapped[str | None] = mapped_column(String(200))

    changed_by: Mapped[int] = mapped_column(ForeignKey("user.id"), nullable=False)
    changed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


STATUSES: list[tuple[str, str]] = [
    ("initial_contact", "初步沟通"),
    ("resume_pushed", "简历已推送"),
    ("interview_scheduled", "面试安排中"),
    ("interview_1_passed", "一面通过"),
    ("interview_2_passed", "二面通过"),
    ("offer_sent", "Offer 发放"),
    ("onboarded", "已入职"),
    ("rejected_1", "一面淘汰"),
    ("rejected_2", "二面淘汰"),
    ("declined_offer", "候选人拒绝 Offer"),
    ("dropped", "流失"),
]
STATUS_LABEL: dict[str, str] = dict(STATUSES)


CHANNELS: list[tuple[str, str]] = [
    ("phone", "电话"),
    ("wechat", "微信"),
    ("email", "邮件"),
    ("in_person", "面对面"),
    ("other", "其他"),
]
CHANNEL_LABEL: dict[str, str] = dict(CHANNELS)
