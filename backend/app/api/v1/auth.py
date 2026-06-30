from datetime import UTC, datetime

from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile, status
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.db.session import get_db
from app.models.user import User
from app.schemas.auth import (
    AccessTokenOut,
    LoginIn,
    LoginOut,
    MeUpdateIn,
    PasswordChangeIn,
    RefreshIn,
    UserOut,
)
from app.services import storage

router = APIRouter(prefix="/auth", tags=["auth"])

_AVATAR_MAX_BYTES = 4 * 1024 * 1024  # 4 MB
_AVATAR_ALLOWED = {"image/jpeg", "image/png", "image/webp", "image/gif"}


def _user_out(user: User) -> UserOut:
    return UserOut(
        id=user.id,
        username=user.username,
        email=user.email,
        display_name=user.display_name,
        avatar_url=f"/api/v1/auth/avatar/{user.id}" if user.avatar_url else None,
        role_name=user.role.name,
    )


@router.post("/login", response_model=LoginOut)
def login(payload: LoginIn, db: Session = Depends(get_db)) -> LoginOut:
    # Accept either username or email in the same field.
    ident = payload.username.strip()
    user = (
        db.query(User)
        .filter(or_(User.username == ident, User.email == ident.lower()))
        .first()
    )
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid credentials")
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="user disabled")

    user.last_login_at = datetime.now(UTC)
    db.commit()
    db.refresh(user)

    return LoginOut(
        access_token=create_access_token(user.id),
        refresh_token=create_refresh_token(user.id),
        user=_user_out(user),
    )


@router.post("/refresh", response_model=AccessTokenOut)
def refresh(payload: RefreshIn, db: Session = Depends(get_db)) -> AccessTokenOut:
    try:
        data = decode_token(payload.refresh_token)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(e)) from e
    if data.get("type") != "refresh":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="not a refresh token")
    user = db.get(User, int(data["sub"]))
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="user not found")
    return AccessTokenOut(access_token=create_access_token(user.id))


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)) -> UserOut:
    return _user_out(user)


@router.post("/logout")
def logout(user: User = Depends(get_current_user)) -> dict:
    return {"ok": True}


# ---------------------------------------------------------------------------
# self-service profile editing
# ---------------------------------------------------------------------------


@router.patch("/me", response_model=UserOut)
def update_me(
    payload: MeUpdateIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> UserOut:
    if payload.display_name is not None:
        user.display_name = payload.display_name.strip() or None
    db.commit()
    db.refresh(user)
    return _user_out(user)


@router.post("/me/password", status_code=status.HTTP_204_NO_CONTENT)
def change_password(
    payload: PasswordChangeIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Response:
    if not verify_password(payload.old_password, user.password_hash):
        raise HTTPException(status_code=400, detail="原密码不正确")
    if payload.old_password == payload.new_password:
        raise HTTPException(status_code=400, detail="新密码不能与原密码相同")
    user.password_hash = hash_password(payload.new_password)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/me/avatar", response_model=UserOut)
async def upload_avatar(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> UserOut:
    if file.content_type not in _AVATAR_ALLOWED:
        raise HTTPException(status_code=400, detail="仅支持 JPG / PNG / WebP / GIF")
    data = await file.read()
    if len(data) > _AVATAR_MAX_BYTES:
        raise HTTPException(status_code=400, detail="头像最大 4 MB")
    if len(data) == 0:
        raise HTTPException(status_code=400, detail="文件为空")

    # Best-effort cleanup of the previous avatar; ignore errors.
    if user.avatar_url:
        try:
            storage.delete(user.avatar_url)
        except Exception:
            pass

    storage_path = storage.save(file.filename or "avatar.bin", data)
    user.avatar_url = storage_path
    db.commit()
    db.refresh(user)
    return _user_out(user)


@router.get("/avatar/{user_id}")
def get_avatar(user_id: int, db: Session = Depends(get_db)) -> Response:
    """Public endpoint — avatars need to render in <img src> without bearer header."""
    target = db.get(User, user_id)
    if not target or not target.avatar_url:
        raise HTTPException(status_code=404, detail="no avatar")
    try:
        data = storage.read(target.avatar_url)
    except storage.StorageError as e:
        raise HTTPException(status_code=500, detail=str(e)) from e
    # Lightweight content-type sniff. Browsers are forgiving; defaulting to
    # image/jpeg keeps things simple and works for png/webp/gif too because
    # the browser inspects the bytes anyway.
    return Response(content=data, media_type="image/jpeg", headers={"Cache-Control": "private, max-age=300"})
