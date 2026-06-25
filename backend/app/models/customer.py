from beanie import Document, Indexed
from pydantic import Field
from typing import Optional
from enum import Enum
from datetime import datetime, timezone


class MembershipTier(str, Enum):
    bronze = "bronze"
    silver = "silver"
    gold = "gold"
    platinum = "platinum"


class Customer(Document):
    name: str
    phone: Indexed(str)  # type: ignore[valid-type]
    email: str = ""
    birthday: Optional[str] = None
    loyalty_points: int = 0
    membership_tier: MembershipTier = MembershipTier.bronze
    total_spent: float = 0.0
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "customers"
