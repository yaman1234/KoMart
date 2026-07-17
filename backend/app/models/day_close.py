"""End-of-day cash close / till reconciliation."""

from beanie import Document
from pydantic import Field
from datetime import datetime, timezone
from typing import Optional
from pymongo import IndexModel, ASCENDING


class DayClose(Document):
    date: str  # YYYY-MM-DD unique
    opening_cash: float = Field(default=0.0, ge=0)
    closing_cash: float = Field(default=0.0, ge=0)
    notes: str = ""
    created_by: str = ""
    updated_by: str = ""
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "day_closes"
        indexes = [
            IndexModel([("date", ASCENDING)], unique=True),
        ]
