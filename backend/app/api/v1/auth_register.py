from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.db.session import get_db
from app.models.user import Role, User

router = APIRouter(prefix="/auth", tags=["auth"])


class IntervieweeRegisterIn(BaseModel):
    username: str
    email: EmailStr
    password: str


class UserBriefOut(BaseModel):
    id: int
    username: str
    email: str
    role_name: str

    model_config = {"from_attributes": True}


@router.post("/register/interviewee", response_model=UserBriefOut, status_code=status.HTTP_201_CREATED)
def register_interviewee(payload: IntervieweeRegisterIn, db: Session = Depends(get_db)):
    """公开注册接口，专为面试者使用。强制角色为 interviewee。"""
    if db.query(User).filter(User.username == payload.username).first():
        raise HTTPException(status_code=400, detail="用户名已存在")
    if db.query(User).filter(User.email == payload.email.lower()).first():
        raise HTTPException(status_code=400, detail="邮箱已存在")

    role = db.query(Role).filter(Role.name == "interviewee").first()
    if not role:
        # 如果角色不存在，自动创建（便于初始化）
        role = Role(name="interviewee", description="面试者（仅能访问面试平台）")
        db.add(role)
        db.commit()
        db.refresh(role)

    user = User(
        username=payload.username,
        email=payload.email.lower(),
        password_hash=hash_password(payload.password),
        role_id=role.id,
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    return UserBriefOut(
        id=user.id,
        username=user.username,
        email=user.email,
        role_name="interviewee",
    )
