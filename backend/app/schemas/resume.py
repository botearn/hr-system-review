from datetime import datetime
from typing import Any

from pydantic import BaseModel, HttpUrl


class ResumeDuplicate(BaseModel):
    candidate_id: int
    name: str
    phone: str | None = None
    email: str | None = None
    city: str | None = None
    matched_by: list[str]  # e.g. ["phone"], ["email"], ["phone", "email"]
    created_at: datetime


class ResumeTaskOut(BaseModel):
    id: int
    user_id: int
    source_type: str
    source_url: str | None
    status: str
    extracted: dict[str, Any] | None = None
    derived_capabilities: list[Any] | None = None
    resume_quality: dict[str, Any] | None = None
    candidate_id: int | None
    error_msg: str | None
    started_at: datetime | None
    finished_at: datetime | None
    created_at: datetime
    updated_at: datetime
    duplicates: list[ResumeDuplicate] = []

    model_config = {"from_attributes": True}


class ResumeTaskBrief(BaseModel):
    id: int
    source_type: str
    source_url: str | None
    status: str
    candidate_id: int | None
    candidate_name: str | None = None
    filename: str | None = None
    error_msg: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class ResumeURLIn(BaseModel):
    url: HttpUrl


class ResumeTaskCreated(BaseModel):
    task_id: int


class ResumeConfirmIn(BaseModel):
    """顾问确认后可对 LLM 解析结果做微调，再落库为 candidate。"""

    overrides: dict[str, Any] | None = None
    merge_candidate_id: int | None = None  # 提供则合并到已有候选人；留空则新建


class ResumeTaskBatchDeleteIn(BaseModel):
    ids: list[int]


class ResumeTaskBatchDeleteOut(BaseModel):
    deleted: list[int]
    skipped: list[dict[str, Any]]
