from pydantic import BaseModel, EmailStr
from typing import Optional
from app.models.user import UserRole


class UserCreate(BaseModel):
    name: str
    email: EmailStr
    password: str
    role: UserRole = UserRole.cashier


class UserUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[EmailStr] = None
    password: Optional[str] = None
    role: Optional[UserRole] = None
    is_active: Optional[bool] = None


class UserMeUpdate(BaseModel):
    name: Optional[str] = None
    password: Optional[str] = None


class UserListItem(BaseModel):
    id: str
    name: str
    email: str
    role: UserRole
    is_active: bool
    created_at: str


class AssignableUserItem(BaseModel):
    id: str
    name: str
