from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, HttpUrl
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.core.deps import forbid_interviewee, get_current_user
from app.db.session import get_db
from app.models.company import Company
from app.models.user import User
from app.schemas.common import Page
from app.schemas.company import CompanyCreate, CompanyOut, CompanyUpdate

router = APIRouter(prefix="/companies", tags=["companies"])


class CompanyFromURLIn(BaseModel):
    url: HttpUrl


class CompanyDraft(BaseModel):
    """从 URL 提取出的企业草稿（不落库，仅返回给前端预填表单）。"""

    name: str | None = None
    industry_tags: list[str] = []
    scale: str | None = None
    funding_stage: str | None = None
    address: str | None = None
    website: str | None = None
    contact_name: str | None = None
    contact_phone: str | None = None
    contact_email: str | None = None
    notes: str | None = None


def _visible(db: Session, user: User):
    q = db.query(Company)
    if user.role.name != "admin":
        q = q.filter(Company.owner_id == user.id)
    return q


@router.get("", response_model=Page[CompanyOut])
def list_companies(
    keyword: str | None = None,
    cooperation_status: str | None = None,
    funding_stage: str | None = None,
    industry_tags: list[str] | None = Query(default=None),
    include_archived: bool = False,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    user: User = Depends(forbid_interviewee),
) -> Page[CompanyOut]:
    q = _visible(db, user)
    if not include_archived:
        q = q.filter(Company.is_archived.is_(False))
    if cooperation_status:
        q = q.filter(Company.cooperation_status == cooperation_status)
    if funding_stage:
        q = q.filter(Company.funding_stage == funding_stage)
    if industry_tags:
        q = q.filter(Company.industry_tags.op("&&")(industry_tags))
    if keyword:
        like = f"%{keyword}%"
        q = q.filter(or_(Company.name.ilike(like), Company.notes.ilike(like)))
    total = q.count()
    items = (
        q.order_by(Company.created_at.desc()).offset((page - 1) * page_size).limit(page_size).all()
    )
    return Page(
        items=[CompanyOut.model_validate(x) for x in items],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/facets")
def company_facets(
    db: Session = Depends(get_db),
    user: User = Depends(forbid_interviewee),
) -> dict:
    q = _visible(db, user).filter(Company.is_archived.is_(False))
    tag_set: set[str] = set()
    for (tags,) in q.with_entities(Company.industry_tags).all():
        if tags:
            tag_set.update(tags)
    stages = sorted(
        {
            r[0]
            for r in q.filter(Company.funding_stage.isnot(None))
            .with_entities(Company.funding_stage)
            .all()
            if r[0]
        }
    )
    return {
        "industry_tags": sorted(tag_set),
        "funding_stages": stages,
        "cooperation_statuses": [
            {"value": "potential", "label": "潜在"},
            {"value": "active", "label": "合作中"},
            {"value": "paused", "label": "暂停"},
            {"value": "terminated", "label": "已终止"},
        ],
    }


@router.post("", response_model=CompanyOut, status_code=status.HTTP_201_CREATED)
def create_company(
    payload: CompanyCreate,
    db: Session = Depends(get_db),
    user: User = Depends(forbid_interviewee),
) -> CompanyOut:
    company = Company(owner_id=user.id, **payload.model_dump())
    db.add(company)
    db.commit()
    db.refresh(company)
    return CompanyOut.model_validate(company)


@router.get("/{company_id}", response_model=CompanyOut)
def get_company(
    company_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(forbid_interviewee),
) -> CompanyOut:
    company = _visible(db, user).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="company not found")
    return CompanyOut.model_validate(company)


@router.patch("/{company_id}", response_model=CompanyOut)
def update_company(
    company_id: int,
    payload: CompanyUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(forbid_interviewee),
) -> CompanyOut:
    company = _visible(db, user).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="company not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(company, field, value)
    db.commit()
    db.refresh(company)
    return CompanyOut.model_validate(company)


@router.post("/{company_id}/archive", response_model=CompanyOut)
def archive_company(
    company_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(forbid_interviewee),
) -> CompanyOut:
    company = _visible(db, user).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="company not found")
    company.is_archived = True
    company.archived_at = datetime.now(UTC)
    db.commit()
    db.refresh(company)
    return CompanyOut.model_validate(company)


@router.post("/from-url", response_model=CompanyDraft)
def company_from_url(
    payload: CompanyFromURLIn,
    _: User = Depends(forbid_interviewee),
) -> CompanyDraft:
    """从企业官网 URL 或企业介绍 PDF URL 抽取企业信息，返回草稿预填表单，**不落库**。

    走 httpx 抓取 + GLM 结构化；招聘平台/个人简历类域名会被拦截。
    """
    from app.services.company_extract import extract_from_url
    from app.services.resume.llm_client import LLMError
    from app.services.resume.url_fetch import PlatformNotSupportedError, URLFetchError

    try:
        draft = extract_from_url(str(payload.url))
    except PlatformNotSupportedError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except URLFetchError as e:
        raise HTTPException(status_code=400, detail=f"抓取失败：{e}") from e
    except LLMError as e:
        raise HTTPException(status_code=500, detail=f"AI 抽取失败：{e}") from e

    return CompanyDraft(**draft)


@router.post("/{company_id}/restore", response_model=CompanyOut)
def restore_company(
    company_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(forbid_interviewee),
) -> CompanyOut:
    company = _visible(db, user).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="company not found")
    company.is_archived = False
    company.archived_at = None
    db.commit()
    db.refresh(company)
    return CompanyOut.model_validate(company)
