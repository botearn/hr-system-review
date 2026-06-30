from datetime import date, datetime

from pydantic import BaseModel, Field


class FollowUpAttachment(BaseModel):
    file_id: int | None = None
    filename: str


class FollowUpCreate(BaseModel):
    candidate_id: int
    position_id: int | None = None
    occurred_at: datetime
    channel: str = Field(..., pattern=r"^(phone|wechat|email|in_person|other)$")
    content: str = Field(..., min_length=1)
    next_plan: str | None = None
    next_plan_due: date | None = None
    attachments: list[FollowUpAttachment] = []


class FollowUpUpdate(BaseModel):
    occurred_at: datetime | None = None
    channel: str | None = Field(None, pattern=r"^(phone|wechat|email|in_person|other)$")
    content: str | None = None
    next_plan: str | None = None
    next_plan_due: date | None = None
    attachments: list[FollowUpAttachment] | None = None


class FollowUpOut(BaseModel):
    id: int
    candidate_id: int
    position_id: int | None
    user_id: int
    occurred_at: datetime
    channel: str
    content: str
    next_plan: str | None
    next_plan_due: date | None
    attachments: list[dict] | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class StatusChangeIn(BaseModel):
    candidate_id: int
    position_id: int | None = None
    to_status: str = Field(
        ...,
        pattern=r"^(initial_contact|resume_pushed|interview_scheduled|"
        r"interview_1_passed|interview_2_passed|offer_sent|onboarded|"
        r"rejected_1|rejected_2|declined_offer|dropped)$",
    )
    reason: str | None = None
    # 候选人去向 (destination):
    #   to_status='onboarded' → 必填
    #   to_status∈{'dropped','declined_offer'} → 选填
    #   其他状态 → 忽略 (后端会清空)
    outcome_company: str | None = Field(None, max_length=200)
    outcome_role: str | None = Field(None, max_length=200)


class StatusChangeOut(BaseModel):
    id: int
    candidate_id: int
    position_id: int | None
    from_status: str | None
    to_status: str
    reason: str | None
    outcome_company: str | None = None
    outcome_role: str | None = None
    changed_by: int
    changed_at: datetime

    model_config = {"from_attributes": True}


class StatusOption(BaseModel):
    value: str
    label: str


class ChannelOption(BaseModel):
    value: str
    label: str


class FollowUpEnumsOut(BaseModel):
    statuses: list[StatusOption]
    channels: list[ChannelOption]


class ReminderOverdueItem(BaseModel):
    candidate_id: int
    candidate_name: str
    next_plan: str | None
    next_plan_due: date
    days_overdue: int  # 0=今天到期, 正数=逾期
    last_follow_channel: str | None = None
    last_follow_content_excerpt: str | None = None


class ReminderStaleItem(BaseModel):
    candidate_id: int
    candidate_name: str
    last_follow_at: datetime
    days_since: int
    last_follow_status: str | None
    last_follow_channel: str | None = None
    last_follow_content_excerpt: str | None = None


class RemindersOut(BaseModel):
    overdue: list[ReminderOverdueItem]
    due_today: list[ReminderOverdueItem]
    stale: list[ReminderStaleItem]
    total: int
