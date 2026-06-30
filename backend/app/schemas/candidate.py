from datetime import date, datetime

from pydantic import BaseModel, EmailStr, Field


class CandidateExperienceIn(BaseModel):
    company_name: str
    position_title: str
    start_date: date | None = None
    end_date: date | None = None
    description: str | None = None


class CandidateProjectIn(BaseModel):
    project_name: str
    role: str | None = None
    start_date: date | None = None
    end_date: date | None = None
    description: str | None = None
    tech_stack: list[str] = Field(default_factory=list)


class CandidateEducationIn(BaseModel):
    school: str
    degree: str | None = None
    major: str | None = None
    start_date: date | None = None
    end_date: date | None = None


class CandidateCreate(BaseModel):
    name: str
    phone: str | None = None
    email: EmailStr | None = None
    wechat: str | None = None
    city: str | None = None
    industry: str | None = None
    years_of_experience: int | None = None
    education_level: str | None = None
    job_status: str = "active"
    current_salary_min: float | None = None
    current_salary_max: float | None = None
    expected_salary_min: float | None = None
    expected_salary_max: float | None = None
    skills: list[str] = Field(default_factory=list)
    notes: str | None = None
    experiences: list[CandidateExperienceIn] = Field(default_factory=list)
    projects: list[CandidateProjectIn] = Field(default_factory=list)
    educations: list[CandidateEducationIn] = Field(default_factory=list)


class CandidateUpdate(BaseModel):
    name: str | None = None
    phone: str | None = None
    email: EmailStr | None = None
    wechat: str | None = None
    city: str | None = None
    industry: str | None = None
    years_of_experience: int | None = None
    education_level: str | None = None
    job_status: str | None = None
    current_salary_min: float | None = None
    current_salary_max: float | None = None
    expected_salary_min: float | None = None
    expected_salary_max: float | None = None
    skills: list[str] | None = None
    notes: str | None = None
    # 嵌套关系: 传入时整体替换,不传则保持不动
    experiences: list[CandidateExperienceIn] | None = None
    projects: list[CandidateProjectIn] | None = None
    educations: list[CandidateEducationIn] | None = None


class CandidateOut(BaseModel):
    id: int
    owner_id: int
    name: str
    phone: str | None
    email: str | None
    wechat: str | None
    city: str | None
    industry: str | None
    years_of_experience: int | None
    education_level: str | None
    job_status: str
    current_salary_min: float | None
    current_salary_max: float | None
    expected_salary_min: float | None
    expected_salary_max: float | None
    skills: list[str]
    derived_capabilities: list | None = None
    resume_quality_score: float | None
    source: str
    is_deleted: bool
    created_at: datetime
    updated_at: datetime

    # 跟进概览字段（仅列表接口填充，详情接口不一定有）
    last_follow_at: datetime | None = None
    last_follow_status: str | None = None

    # 候选人去向（仅当最近一次状态=已入职时有值）
    landed_company: str | None = None
    landed_role: str | None = None

    model_config = {"from_attributes": True}


class CandidateExperienceOut(BaseModel):
    id: int
    company_name: str
    position_title: str
    start_date: date | None
    end_date: date | None
    description: str | None

    model_config = {"from_attributes": True}


class CandidateProjectOut(BaseModel):
    id: int
    project_name: str
    role: str | None
    start_date: date | None
    end_date: date | None
    description: str | None
    tech_stack: list[str]

    model_config = {"from_attributes": True}


class CandidateEducationOut(BaseModel):
    id: int
    school: str
    degree: str | None
    major: str | None
    start_date: date | None
    end_date: date | None

    model_config = {"from_attributes": True}


class CandidateDetailOut(CandidateOut):
    """带经历/项目/教育的完整候选人视图(用于候选人详情卡)。"""

    experiences: list[CandidateExperienceOut] = []
    projects: list[CandidateProjectOut] = []
    educations: list[CandidateEducationOut] = []
    # 原简历入口(下载通过 /candidates/{id}/resume 端点)
    resume_file_id: int | None = None
    resume_file_name: str | None = None
    resume_source_url: str | None = None
    # 网络画像
    web_profile: dict | None = None
    web_profile_updated_at: datetime | None = None


class CandidateListFilter(BaseModel):
    name: str | None = None
    phone: str | None = None
    email: str | None = None
    city: str | None = None
    industry: str | None = None
    job_status: str | None = None
    min_years: int | None = None
    max_years: int | None = None
    keyword: str | None = None
    page: int = 1
    page_size: int = 20
