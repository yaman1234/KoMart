from beanie import Document
from pydantic import Field
from typing import Optional
from enum import Enum
from datetime import datetime, timezone
from pymongo import IndexModel, ASCENDING, DESCENDING


class NotificationType(str, Enum):
    low_stock = "low_stock"
    expiry = "expiry"
    purchase_reminder = "purchase_reminder"
    system = "system"


class Notification(Document):
    type: NotificationType
    title: str
    message: str
    read: bool = False
    link: Optional[str] = None
    source_key: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "notifications"
        indexes = [
            IndexModel([("read", ASCENDING), ("created_at", DESCENDING)]),
            IndexModel([("source_key", ASCENDING)], sparse=True),
        ]
