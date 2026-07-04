from beanie import Document
from pydantic import Field
from typing import Optional
from datetime import datetime, timezone
from pymongo import ASCENDING, IndexModel


class Supplier(Document):
    name: str
    country: str
    contact_person: str
    phone: str
    email: Optional[str] = None
    address: str
    is_active: bool = True
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "suppliers"
        indexes = [
            IndexModel([("name", ASCENDING)]),
            IndexModel([("is_active", ASCENDING), ("name", ASCENDING)]),
        ]
