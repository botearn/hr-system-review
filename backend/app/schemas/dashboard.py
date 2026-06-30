from datetime import date

from pydantic import BaseModel


class KPISpark(BaseModel):
    """单个 KPI 卡片:数字 + 30 天 sparkline + 环比百分比。"""

    value: int
    label: str
    sparkline: list[int]  # 30 个点
    delta_pct: float | None = None  # 环比百分比, None 表示没有可比基准
    source: str  # hover 时显示的数据来源说明


class FunnelStage(BaseModel):
    key: str
    label: str
    count: int
    conversion_pct: float | None  # 相对前一段的转化率


class BreakdownItem(BaseModel):
    key: str
    label: str
    count: int


class DayActivity(BaseModel):
    day: date
    follow_ups: int
    status_changes: int


class DashboardOverview(BaseModel):
    kpis: list[KPISpark]  # 4 张卡
    funnel: list[FunnelStage]  # 推送 → 面试 → offer → 入职
    industry_breakdown: list[BreakdownItem]  # Top N 行业
    job_status_breakdown: list[BreakdownItem]  # active/watching/onboarded
    activity_7d: list[DayActivity]
    scope: str  # "self" | "org"
    generated_at: str  # ISO timestamp


class AIInsight(BaseModel):
    text: str
    cached: bool
    generated_at: str
