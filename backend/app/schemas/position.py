from datetime import date, datetime

from pydantic import BaseModel, Field


class PositionCreate(BaseModel):
    company_id: int
    title: str
    type: str | None = None
    responsibilities: str | None = None
    requirements: str | None = None
    required_skills: list[str] = Field(default_factory=list)
    nice_to_have_skills: list[str] = Field(default_factory=list)
    min_years: int | None = None
    max_years: int | None = None
    required_education: str | None = None
    salary_min: float | None = None
    salary_max: float | None = None
    city: str | None = None
    remote_ok: bool = False
    headcount: int = 1
    benefits: str | None = None
    onboard_deadline: date | None = None
    is_template: bool = False
    template_name: str | None = None


class PositionUpdate(BaseModel):
    title: str | None = None
    type: str | None = None
    responsibilities: str | None = None
    requirements: str | None = None
    required_skills: list[str] | None = None
    nice_to_have_skills: list[str] | None = None
    min_years: int | None = None
    max_years: int | None = None
    required_education: str | None = None
    salary_min: float | None = None
    salary_max: float | None = None
    city: str | None = None
    remote_ok: bool | None = None
    headcount: int | None = None
    benefits: str | None = None
    onboard_deadline: date | None = None
    # 拖拽改状态(open / paused / filled);closed 走专门的 close endpoint
    status: str | None = None


class PositionOut(BaseModel):
    id: int
    company_id: int
    owner_id: int
    title: str
    type: str | None
    responsibilities: str | None
    requirements: str | None
    required_skills: list[str]
    nice_to_have_skills: list[str]
    required_capabilities: list | None
    min_years: int | None
    max_years: int | None
    required_education: str | None
    salary_min: float | None
    salary_max: float | None
    city: str | None
    remote_ok: bool
    headcount: int
    benefits: str | None
    onboard_deadline: date | None
    status: str
    closed_reason: str | None
    is_template: bool
    template_name: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class PositionCloseIn(BaseModel):
    reason: str | None = None
