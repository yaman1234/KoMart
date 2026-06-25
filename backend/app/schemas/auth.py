from pydantic import BaseModel
from app.models.user import UserRole


class LoginRequest(BaseModel):
    email: str
    password: str


class ForgotPasswordRequest(BaseModel):
    email: str


class UserResponse(BaseModel):
    id: str
    email: str
    name: str
    role: UserRole
    avatar: str | None = None
    created_at: str


class TokenResponse(BaseModel):
    access_token: str
    user: UserResponse


class TokenData(BaseModel):
    user_id: str | None = None
