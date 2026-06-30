from pydantic import BaseModel, EmailStr, Field


class UserCreateIn(BaseModel):
    username: str = Field(..., min_length=2, max_length=64)
    email: EmailStr
    password: str = Field(..., min_length=6, max_length=128)
    display_name: str | None = Field(None, max_length=64)
    role_name: str = Field(default="consultant", description="admin or consultant")


class UserUpdateIn(BaseModel):
    display_name: str | None = None
    role_name: str | None = None
    is_active: bool | None = None


class UserListOut(BaseModel):
    id: int
    username: str
    email: str
    display_name: str | None = None
    avatar_url: str | None = None
    role_name: str
    is_active: bool

    model_config = {"from_attributes": True}
