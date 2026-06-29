from beanie import Document, Indexed
from pydantic import Field
from typing import Optional
from enum import Enum
from datetime import datetime, timezone


class UserRole(str, Enum):
    admin = "admin"
    manager = "manager"
    cashier = "cashier"


class User(Document):
    email: Indexed(str, unique=True)  # type: ignore[valid-type]
    name: str
    hashed_password: str
    role: UserRole = UserRole.cashier
    avatar: Optional[str] = None
    is_active: bool = True
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "users"
        indexes = ["email"]
