from pydantic import BaseModel, EmailStr, Field


class LoginIn(BaseModel):
    """`username` accepts either the username or the email address."""

    username: str
    password: str


class UserOut(BaseModel):
    id: int
    username: str
    email: EmailStr
    display_name: str | None = None
    avatar_url: str | None = None
    role_name: str

    model_config = {"from_attributes": True}


class LoginOut(BaseModel):
    access_token: str
    refresh_token: str
    user: UserOut


class RefreshIn(BaseModel):
    refresh_token: str


class AccessTokenOut(BaseModel):
    access_token: str


class MeUpdateIn(BaseModel):
    display_name: str | None = Field(None, max_length=64)


class PasswordChangeIn(BaseModel):
    old_password: str
    new_password: str = Field(..., min_length=6, max_length=128)
