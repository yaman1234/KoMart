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
    receive = "receive"


class InventoryBatch(Document):
    product_id: str
    batch_number: str
    quantity: int
    unit_cost: float = 0.0
    expiry_date: Optional[str] = None
    purchase_order_id: Optional[str] = None
    received_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "inventory_batches"
        indexes = [
            IndexModel([("product_id", ASCENDING), ("expiry_date", ASCENDING)]),
            IndexModel([("expiry_date", ASCENDING)]),
            IndexModel([("product_id", ASCENDING), ("quantity", ASCENDING)]),
        ]


class StockAdjustment(Document):
    product_id: str
    product_name: str = ""
    product_sku: str = ""
    batch_id: Optional[str] = None
    transaction_id: Optional[str] = None
    reference_type: str = ""
    reference_id: str = ""
    type: AdjustmentType
    quantity: int
    stock_before: int = 0
    stock_after: int = 0
    unit_cost: float = 0.0
    extended_cost: float = 0.0
    unit_selling_price: float = 0.0
    extended_revenue: float = 0.0
    line_discount: float = 0.0
    category: str = ""
    reason: str
    created_by: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "stock_adjustments"
        indexes = [
            IndexModel([("product_id", ASCENDING), ("created_at", DESCENDING)]),
            IndexModel([("transaction_id", ASCENDING)]),
            IndexModel([("type", ASCENDING), ("created_at", DESCENDING)]),
            IndexModel([("created_at", DESCENDING)]),
            IndexModel([("reference_type", ASCENDING), ("created_at", DESCENDING)]),
        ]
