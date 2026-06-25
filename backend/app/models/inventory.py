from beanie import Document
from pydantic import Field
from typing import Optional
from enum import Enum
from datetime import datetime, timezone
from pymongo import IndexModel, ASCENDING, DESCENDING


class AdjustmentType(str, Enum):
    adjustment = "adjustment"
    damaged = "damaged"
    correction = "correction"
    sale = "sale"


class InventoryBatch(Document):
    product_id: str
    batch_number: str
    quantity: int
    expiry_date: Optional[str] = None
    purchase_order_id: Optional[str] = None
    received_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "inventory_batches"
        indexes = [
            IndexModel([("product_id", ASCENDING), ("expiry_date", ASCENDING)]),
            IndexModel([("expiry_date", ASCENDING)]),
        ]


class StockAdjustment(Document):
    product_id: str
    batch_id: Optional[str] = None
    transaction_id: Optional[str] = None
    type: AdjustmentType
    quantity: int
    reason: str
    created_by: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "stock_adjustments"
        indexes = [
            IndexModel([("product_id", ASCENDING), ("created_at", DESCENDING)]),
            IndexModel([("transaction_id", ASCENDING)]),
        ]
