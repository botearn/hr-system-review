from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.deps import require_admin
from app.core.security import hash_password
from app.db.session import get_db
from app.models.user import Role, User
from app.schemas.user import UserCreateIn, UserListOut, UserUpdateIn

router = APIRouter(prefix="/users", tags=["users"])


def _to_out(user: User) -> UserListOut:
    return UserListOut(
        id=user.id,
        username=user.username,
        email=user.email,
        display_name=user.display_name,
        avatar_url=f"/api/v1/auth/avatar/{user.id}" if user.avatar_url else None,
        role_name=user.role.name,
        is_active=user.is_active,
    )


@router.get("", response_model=list[UserListOut])
def list_users(
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
) -> list[UserListOut]:
    users = db.query(User).order_by(User.id).all()
    return [_to_out(u) for u in users]


@router.post("", response_model=UserListOut, status_code=status.HTTP_201_CREATED)
def create_user(
    payload: UserCreateIn,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
) -> UserListOut:
    # Check duplicate username / email
    if db.query(User).filter(User.username == payload.username).first():
        raise HTTPException(status_code=400, detail="用户名已存在")
    if db.query(User).filter(User.email == payload.email.lower()).first():
        raise HTTPException(status_code=400, detail="邮箱已存在")

    role = db.query(Role).filter(Role.name == payload.role_name).first()
    if not role:
        raise HTTPException(status_code=400, detail=f"角色 {payload.role_name} 不存在")

    user = User(
        username=payload.username.strip(),
        email=payload.email.lower(),
        password_hash=hash_password(payload.password),
        display_name=payload.display_name,
        role_id=role.id,
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return _to_out(user)


@router.patch("/{user_id}", response_model=UserListOut)
def update_user(
    user_id: int,
    payload: UserUpdateIn,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
) -> UserListOut:
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")

    if payload.display_name is not None:
        user.display_name = payload.display_name.strip() or None
    if payload.is_active is not None:
        if user.id == admin.id:
            raise HTTPException(status_code=400, detail="不能禁用自己")
        user.is_active = payload.is_active
    if payload.role_name is not None:
        role = db.query(Role).filter(Role.name == payload.role_name).first()
        if not role:
            raise HTTPException(status_code=400, detail=f"角色 {payload.role_name} 不存在")
        if user.id == admin.id:
            raise HTTPException(status_code=400, detail="不能修改自己的角色")
        user.role_id = role.id

    db.commit()
    db.refresh(user)
    return _to_out(user)
