from datetime import datetime, timezone
from typing import Optional

from beanie import Document
from pydantic import Field
from pymongo import ASCENDING, IndexModel


class RefreshToken(Document):
    """Hashed refresh token session — one row per device/login."""

    user_id: str
    token_hash: str
    family_id: str
    device_label: str = ""
    user_agent: str = ""
    ip_address: str = ""
    expires_at: datetime
    revoked_at: Optional[datetime] = None
    replaced_by_hash: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "refresh_tokens"
        indexes = [
            IndexModel([("token_hash", ASCENDING)], unique=True),
            IndexModel([("user_id", ASCENDING), ("created_at", ASCENDING)]),
            IndexModel([("family_id", ASCENDING)]),
            IndexModel([("expires_at", ASCENDING)]),
        ]
