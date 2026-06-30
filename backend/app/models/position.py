from datetime import date

from sqlalchemy import ARRAY, Boolean, Date, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin


class Position(Base, TimestampMixin):
    __tablename__ = "position"

    id: Mapped[int] = mapped_column(primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("company.id"), nullable=False, index=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey("user.id"), nullable=False, index=True)

    title: Mapped[str] = mapped_column(String(128), nullable=False)
    type: Mapped[str | None] = mapped_column(String(32))  # AI算法/AI产品/数据/工程/其他

    responsibilities: Mapped[str | None] = mapped_column(Text)
    requirements: Mapped[str | None] = mapped_column(Text)

    required_skills: Mapped[list[str]] = mapped_column(ARRAY(String), default=list, nullable=False)
    nice_to_have_skills: Mapped[list[str]] = mapped_column(
        ARRAY(String), default=list, nullable=False
    )
    required_capabilities: Mapped[list | None] = mapped_column(JSONB)

    min_years: Mapped[int | None] = mapped_column(Integer)
    max_years: Mapped[int | None] = mapped_column(Integer)
    required_education: Mapped[str | None] = mapped_column(String(16))

    salary_min: Mapped[float | None] = mapped_column(Numeric(10, 2))
    salary_max: Mapped[float | None] = mapped_column(Numeric(10, 2))

    city: Mapped[str | None] = mapped_column(String(64), index=True)
    remote_ok: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    headcount: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    benefits: Mapped[str | None] = mapped_column(Text)
    onboard_deadline: Mapped[date | None] = mapped_column(Date)

    status: Mapped[str] = mapped_column(
        String(16), default="open", nullable=False, index=True
    )  # open/paused/closed/filled
    closed_reason: Mapped[str | None] = mapped_column(String(255))

    is_template: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    template_name: Mapped[str | None] = mapped_column(String(128))
