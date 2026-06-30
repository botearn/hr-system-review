from datetime import datetime

from sqlalchemy import ARRAY, Boolean, DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin


class Company(Base, TimestampMixin):
    __tablename__ = "company"

    id: Mapped[int] = mapped_column(primary_key=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey("user.id"), nullable=False, index=True)

    name: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    industry_tags: Mapped[list[str]] = mapped_column(ARRAY(String), default=list, nullable=False)
    scale: Mapped[str | None] = mapped_column(String(16))  # <20 / 20-100 / 100-500 / 500+
    funding_stage: Mapped[str | None] = mapped_column(String(16))  # seed/A/B/C/D+/IPO/self
    address: Mapped[str | None] = mapped_column(String(255))
    website: Mapped[str | None] = mapped_column(String(255))

    contact_name: Mapped[str | None] = mapped_column(String(64))
    contact_phone: Mapped[str | None] = mapped_column(String(32))
    contact_email: Mapped[str | None] = mapped_column(String(255))

    cooperation_status: Mapped[str] = mapped_column(
        String(16), default="potential", nullable=False
    )  # potential/active/paused/terminated

    notes: Mapped[str | None] = mapped_column(Text)

    is_archived: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, index=True)
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
