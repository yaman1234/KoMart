from beanie import Document
from pydantic import Field
from typing import Optional
from datetime import datetime, timezone


class Supplier(Document):
    name: str
    country: str
    contact_person: str
    phone: str
    email: Optional[str] = None
    address: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "suppliers"
