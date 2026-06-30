from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.deps import forbid_interviewee, get_current_user
from app.db.session import get_db
from app.models.company import Company
from app.models.position import Position
from app.models.user import User
from app.schemas.common import Page
from app.schemas.position import (
    PositionCloseIn,
    PositionCreate,
    PositionOut,
    PositionUpdate,
)

router = APIRouter(prefix="/positions", tags=["positions"])


def _visible(db: Session, user: User):
    q = db.query(Position)
    if user.role.name != "admin":
        q = q.filter(Position.owner_id == user.id)
    return q


def _trigger_capability_derive(position_id: int) -> None:
    """岗位创建/更新后，异步让 LLM 提炼 required_capabilities。"""
    from app.services.position_capability import derive_for_position

    derive_for_position(position_id)


@router.get("", response_model=Page[PositionOut])
def list_positions(
    company_id: int | None = None,
    status_: str | None = Query(None, alias="status"),
    type_: str | None = Query(None, alias="type"),
    city: str | None = None,
    keyword: str | None = None,
    is_template: bool | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    user: User = Depends(forbid_interviewee),
) -> Page[PositionOut]:
    q = _visible(db, user)
    if company_id is not None:
        q = q.filter(Position.company_id == company_id)
    if status_:
        q = q.filter(Position.status == status_)
    if type_:
        q = q.filter(Position.type == type_)
    if city:
        q = q.filter(Position.city == city)
    if is_template is not None:
        q = q.filter(Position.is_template.is_(is_template))
    if keyword:
        like = f"%{keyword}%"
        q = q.filter(
            (Position.title.ilike(like))
            | (Position.responsibilities.ilike(like))
            | (Position.requirements.ilike(like))
        )
    total = q.count()
    items = (
        q.order_by(Position.created_at.desc()).offset((page - 1) * page_size).limit(page_size).all()
    )
    return Page(
        items=[PositionOut.model_validate(x) for x in items],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/facets")
def position_facets(
    db: Session = Depends(get_db),
    user: User = Depends(forbid_interviewee),
) -> dict:
    q = _visible(db, user)
    cities = sorted(
        {
            r[0]
            for r in q.filter(Position.city.isnot(None)).with_entities(Position.city).all()
            if r[0]
        }
    )
    types = sorted(
        {
            r[0]
            for r in q.filter(Position.type.isnot(None)).with_entities(Position.type).all()
            if r[0]
        }
    )
    return {
        "cities": cities,
        "types": types,
        "statuses": [
            {"value": "open", "label": "招聘中"},
            {"value": "paused", "label": "暂停"},
            {"value": "closed", "label": "已关闭"},
            {"value": "filled", "label": "已招满"},
        ],
    }


@router.post("", response_model=PositionOut, status_code=status.HTTP_201_CREATED)
def create_position(
    payload: PositionCreate,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
    user: User = Depends(forbid_interviewee),
) -> PositionOut:
    company = db.get(Company, payload.company_id)
    if not company:
        raise HTTPException(status_code=404, detail="company not found")
    if user.role.name != "admin" and company.owner_id != user.id:
        raise HTTPException(status_code=403, detail="not your company")

    position = Position(owner_id=user.id, **payload.model_dump())
    db.add(position)
    db.commit()
    db.refresh(position)

    if position.responsibilities or position.requirements:
        background.add_task(_trigger_capability_derive, position.id)

    return PositionOut.model_validate(position)


@router.get("/{position_id}", response_model=PositionOut)
def get_position(
    position_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(forbid_interviewee),
) -> PositionOut:
    position = _visible(db, user).filter(Position.id == position_id).first()
    if not position:
        raise HTTPException(status_code=404, detail="position not found")
    return PositionOut.model_validate(position)


@router.patch("/{position_id}", response_model=PositionOut)
def update_position(
    position_id: int,
    payload: PositionUpdate,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
    user: User = Depends(forbid_interviewee),
) -> PositionOut:
    position = _visible(db, user).filter(Position.id == position_id).first()
    if not position:
        raise HTTPException(status_code=404, detail="position not found")

    patched = payload.model_dump(exclude_unset=True)
    need_rerun = any(k in patched for k in ("responsibilities", "requirements"))
    for field, value in patched.items():
        setattr(position, field, value)
    db.commit()
    db.refresh(position)

    if need_rerun:
        background.add_task(_trigger_capability_derive, position.id)

    return PositionOut.model_validate(position)


@router.post("/{position_id}/close", response_model=PositionOut)
def close_position(
    position_id: int,
    payload: PositionCloseIn,
    db: Session = Depends(get_db),
    user: User = Depends(forbid_interviewee),
) -> PositionOut:
    position = _visible(db, user).filter(Position.id == position_id).first()
    if not position:
        raise HTTPException(status_code=404, detail="position not found")
    position.status = "closed"
    position.closed_reason = payload.reason
    db.commit()
    db.refresh(position)
    return PositionOut.model_validate(position)


@router.post("/{position_id}/reopen", response_model=PositionOut)
def reopen_position(
    position_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(forbid_interviewee),
) -> PositionOut:
    position = _visible(db, user).filter(Position.id == position_id).first()
    if not position:
        raise HTTPException(status_code=404, detail="position not found")
    position.status = "open"
    position.closed_reason = None
    db.commit()
    db.refresh(position)
    return PositionOut.model_validate(position)
