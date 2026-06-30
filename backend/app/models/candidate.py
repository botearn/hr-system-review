from datetime import date, datetime

from sqlalchemy import (
    ARRAY,
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin

# ---------------------------------------------------------------------------
# 关系:job_status (求职状态) ↔ follow_up.status_change.to_status (跟进状态)
# ---------------------------------------------------------------------------
# 这两个字段语义独立但有联动:
#
#   job_status 是候选人**自己**的状态(他想不想找工作),取值:
#     - active     可推送(默认)
#     - watching   有空再聊(仅向后兼容,前端不再让用户显式切换)
#     - onboarded  已入职,暂搁置
#
#   follow_up.status_change.to_status 是顾问**和这个候选人**的关系阶段
#   (推到哪一步了),取值见 app/models/follow_up.py STATUSES。
#
# 自动推导规则(见 app/api/v1/follow_ups.py create_status_change):
#   to_status == "onboarded"
#       → cand.job_status = "onboarded"
#   to_status ∈ {"dropped", "declined_offer"} 且 cand.job_status == "onboarded"
#       → cand.job_status = "active"  (已入职后又流失/拒 offer,可重新推送)
#
# 前端表现(见 frontend/src/components/CandidateCard.tsx):
#   - 卡片封面渐变色 = job_status (隐式表达,猎头不直接编辑)
#   - 封面 pill 文字 = 最近一次跟进状态 (显式)
# ---------------------------------------------------------------------------


class Candidate(Base, TimestampMixin):
    __tablename__ = "candidate"

    id: Mapped[int] = mapped_column(primary_key=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey("user.id"), nullable=False, index=True)

    name: Mapped[str] = mapped_column(String(64), nullable=False)
    phone: Mapped[str | None] = mapped_column(String(32), index=True)
    email: Mapped[str | None] = mapped_column(String(255), index=True)
    wechat: Mapped[str | None] = mapped_column(String(64))
    city: Mapped[str | None] = mapped_column(String(64), index=True)
    industry: Mapped[str | None] = mapped_column(String(64), index=True)
    years_of_experience: Mapped[int | None] = mapped_column(Integer)
    education_level: Mapped[str | None] = mapped_column(String(16))

    # 求职状态 active/watching/onboarded
    # 跟进状态 onboarded 时会自动同步到此字段(详见文件顶部说明)
    job_status: Mapped[str] = mapped_column(String(16), default="active", nullable=False)

    current_salary_min: Mapped[float | None] = mapped_column(Numeric(10, 2))
    current_salary_max: Mapped[float | None] = mapped_column(Numeric(10, 2))
    expected_salary_min: Mapped[float | None] = mapped_column(Numeric(10, 2))
    expected_salary_max: Mapped[float | None] = mapped_column(Numeric(10, 2))

    skills: Mapped[list[str]] = mapped_column(ARRAY(String), default=list, nullable=False)

    derived_capabilities: Mapped[list | None] = mapped_column(JSONB)
    resume_quality: Mapped[dict | None] = mapped_column(JSONB)
    resume_quality_score: Mapped[float | None] = mapped_column(Numeric(5, 2))

    resume_text: Mapped[str | None] = mapped_column(Text)
    resume_file_id: Mapped[int | None] = mapped_column(Integer)
    raw_extracted: Mapped[dict | None] = mapped_column(JSONB)

    source: Mapped[str] = mapped_column(String(16), default="manual", nullable=False)
    notes: Mapped[str | None] = mapped_column(Text)

    # Denormalized 去向: 仅当最近一次 status_change.to_status='onboarded' 时有值。
    # 任何会改变"最新一条 status_change"的操作都需要重算这两个字段，
    # 详见 app/api/v1/follow_ups.py _resync_landed()。
    landed_company: Mapped[str | None] = mapped_column(String(200))
    landed_role: Mapped[str | None] = mapped_column(String(200))

    # 网络画像
    web_profile: Mapped[dict | None] = mapped_column(JSONB)
    web_profile_updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, index=True)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    deleted_reason: Mapped[str | None] = mapped_column(String(255))

    experiences: Mapped[list["CandidateExperience"]] = relationship(
        back_populates="candidate", cascade="all, delete-orphan"
    )
    projects: Mapped[list["CandidateProject"]] = relationship(
        back_populates="candidate", cascade="all, delete-orphan"
    )
    educations: Mapped[list["CandidateEducation"]] = relationship(
        back_populates="candidate", cascade="all, delete-orphan"
    )


class CandidateExperience(Base, TimestampMixin):
    __tablename__ = "candidate_experience"

    id: Mapped[int] = mapped_column(primary_key=True)
    candidate_id: Mapped[int] = mapped_column(
        ForeignKey("candidate.id", ondelete="CASCADE"), nullable=False, index=True
    )
    company_name: Mapped[str] = mapped_column(String(128), nullable=False)
    position_title: Mapped[str] = mapped_column(String(128), nullable=False)
    start_date: Mapped[date | None] = mapped_column(Date)
    end_date: Mapped[date | None] = mapped_column(Date)
    description: Mapped[str | None] = mapped_column(Text)

    candidate: Mapped[Candidate] = relationship(back_populates="experiences")


class CandidateProject(Base, TimestampMixin):
    __tablename__ = "candidate_project"

    id: Mapped[int] = mapped_column(primary_key=True)
    candidate_id: Mapped[int] = mapped_column(
        ForeignKey("candidate.id", ondelete="CASCADE"), nullable=False, index=True
    )
    project_name: Mapped[str] = mapped_column(String(128), nullable=False)
    role: Mapped[str | None] = mapped_column(String(64))
    start_date: Mapped[date | None] = mapped_column(Date)
    end_date: Mapped[date | None] = mapped_column(Date)
    description: Mapped[str | None] = mapped_column(Text)
    tech_stack: Mapped[list[str]] = mapped_column(ARRAY(String), default=list, nullable=False)

    candidate: Mapped[Candidate] = relationship(back_populates="projects")


class CandidateEducation(Base, TimestampMixin):
    __tablename__ = "candidate_education"

    id: Mapped[int] = mapped_column(primary_key=True)
    candidate_id: Mapped[int] = mapped_column(
        ForeignKey("candidate.id", ondelete="CASCADE"), nullable=False, index=True
    )
    school: Mapped[str] = mapped_column(String(128), nullable=False)
    degree: Mapped[str | None] = mapped_column(String(16))
    major: Mapped[str | None] = mapped_column(String(64))
    start_date: Mapped[date | None] = mapped_column(Date)
    end_date: Mapped[date | None] = mapped_column(Date)

    candidate: Mapped[Candidate] = relationship(back_populates="educations")
