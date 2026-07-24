"""Short-TTL response cache documents stored in Atlas (shared across Vercel instances)."""

from datetime import datetime, timezone
from typing import Any

from beanie import Document
from pydantic import Field
from pymongo import IndexModel, ASCENDING


class CacheEntry(Document):
    key: str
    payload: dict[str, Any] = Field(default_factory=dict)
    expires_at: datetime

    class Settings:
        name = "cache_entries"
        indexes = [
            IndexModel([("key", ASCENDING)], unique=True),
            # Mongo TTL sweeper deletes docs once expires_at is in the past.
            IndexModel([("expires_at", ASCENDING)], expireAfterSeconds=0),
        ]
