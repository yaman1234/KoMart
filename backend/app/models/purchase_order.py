from beanie import Document
from pydantic import BaseModel, Field
from typing import Optional
from enum import Enum
from datetime import datetime, timezone
from pymongo import IndexModel, ASCENDING, DESCENDING


class POStatus(str, Enum):
    draft = "draft"
    ordered = "ordered"
    partial = "partial"
    received = "received"
    cancelled = "cancelled"


class LineStatus(str, Enum):
    pending = "pending"
    partial = "partial"
    received = "received"


class PurchaseOrderItem(BaseModel):
    product_id: str
    product_name: str
    quantity: int = Field(ge=1)
    unit_cost: float = Field(ge=0)
    received_quantity: int = Field(default=0, ge=0)


def line_status(item: PurchaseOrderItem) -> LineStatus:
    if item.received_quantity <= 0:
        return LineStatus.pending
    if item.received_quantity >= item.quantity:
        return LineStatus.received
    return LineStatus.partial


def compute_po_status(items: list[PurchaseOrderItem]) -> POStatus:
    if not items:
        return POStatus.ordered
    if all(i.received_quantity >= i.quantity for i in items):
        return POStatus.received
    if any(i.received_quantity > 0 for i in items):
        return POStatus.partial
    return POStatus.ordered


class PurchaseOrder(Document):
    order_number: str
    supplier_id: str
    supplier_name: str
    status: POStatus = POStatus.draft
    items: list[PurchaseOrderItem] = Field(default_factory=list)
    total_amount: float = Field(ge=0)
    expected_delivery: Optional[str] = None
    ordered_by: Optional[str] = None
    received_by: Optional[str] = None
    received_date: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "purchase_orders"
        indexes = [
            IndexModel([("status", ASCENDING), ("created_at", DESCENDING)]),
            IndexModel([("supplier_id", ASCENDING), ("created_at", DESCENDING)]),
            IndexModel([("order_number", ASCENDING)], unique=True),
        ]
