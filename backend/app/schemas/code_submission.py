from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class CodeSubmissionCreate(BaseModel):
    """面试者提交代码作品时使用"""
    challenge_id: str = Field(..., pattern="^(01|02|03|04)$")
    github_url: str
    # 可选：如果同时上传了简历，这里传 attachment id（由简历上传接口返回）
    resume_attachment_id: int | None = None


class CodeSubmissionScoreIn(BaseModel):
    """面试官打分使用"""
    score: float = Field(..., ge=0, le=100)
    grade: str | None = Field(None, pattern="^[SABC]$")
    notes: str | None = None


class CodeSubmissionOut(BaseModel):
    id: int
    user_id: int
    challenge_id: str
    github_url: str
    resume_attachment_id: int | None = None
    candidate_id: int | None = None
    status: str
    submitted_at: datetime

    time_spent_seconds: int | None = None
    score: float | None = None
    grade: str | None = None
    notes: str | None = None
    evaluated_by: int | None = None
    evaluated_at: datetime | None = None

    model_config = {"from_attributes": True}


class CodeSubmissionBrief(BaseModel):
    """列表用精简信息"""
    id: int
    challenge_id: str
    github_url: str
    candidate_id: int | None
    status: str
    submitted_at: datetime
    time_spent_seconds: int | None = None
    score: float | None = None
    grade: str | None = None

    model_config = {"from_attributes": True}


class CodeSubmissionListItem(BaseModel):
    """HR 后台面试管理列表用，含提交者信息"""
    id: int
    challenge_id: str
    github_url: str
    candidate_id: int | None
    status: str
    submitted_at: datetime
    time_spent_seconds: int | None = None
    score: Optional[float] = None
    grade: str | None = None
    notes: str | None = None
    evaluated_at: Optional[datetime] = None
    # 提交者信息（JOIN 后填充）
    user_id: int
    submitter_username: str
    submitter_name: str | None = None
    submitter_email: str | None = None

    model_config = {"from_attributes": False}
