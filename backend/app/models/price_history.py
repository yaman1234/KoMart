from datetime import datetime, timezone

from beanie import Document
from pydantic import Field


class PriceHistory(Document):
    product_id: str
    field: str  # cost_price | selling_price
    old_value: float
    new_value: float
    effective_from: str  # AD YYYY-MM-DD
    changed_by: str = ""
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "price_history"
