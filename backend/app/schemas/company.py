from datetime import datetime

from pydantic import BaseModel, EmailStr, Field


class CompanyCreate(BaseModel):
    name: str
    industry_tags: list[str] = Field(default_factory=list)
    scale: str | None = None
    funding_stage: str | None = None
    address: str | None = None
    website: str | None = None
    contact_name: str | None = None
    contact_phone: str | None = None
    contact_email: EmailStr | None = None
    cooperation_status: str = "potential"
    notes: str | None = None


class CompanyUpdate(BaseModel):
    name: str | None = None
    industry_tags: list[str] | None = None
    scale: str | None = None
    funding_stage: str | None = None
    address: str | None = None
    website: str | None = None
    contact_name: str | None = None
    contact_phone: str | None = None
    contact_email: EmailStr | None = None
    cooperation_status: str | None = None
    notes: str | None = None


class CompanyOut(BaseModel):
    id: int
    owner_id: int
    name: str
    industry_tags: list[str]
    scale: str | None
    funding_stage: str | None
    address: str | None
    website: str | None
    contact_name: str | None
    contact_phone: str | None
    contact_email: str | None
    cooperation_status: str
    notes: str | None
    is_archived: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
