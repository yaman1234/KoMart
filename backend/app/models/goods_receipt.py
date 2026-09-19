from datetime import datetime, timezone
from enum import Enum
from typing import Optional

from beanie import Document
from pydantic import BaseModel, Field, field_validator
from pymongo import IndexModel, ASCENDING, DESCENDING


class GoodsReceiptStatus(str, Enum):
    draft = "draft"
    confirmed = "confirmed"
    cancelled = "cancelled"


class GoodsReceiptItem(BaseModel):
    product_id: str
    product_name: str = ""
    ordered_quantity: int = 0
    previously_received: int = 0
    receive_quantity: int = Field(ge=0)  # order/buy UOM
    damaged_quantity: int = Field(default=0, ge=0)
    unit_cost: float = Field(default=0, ge=0)  # pack cost
    units_per_buy_uom: int = Field(default=1, ge=1)
    order_uom: str = "pcs"
    base_uom: str = "pcs"
    expiry_date: Optional[str] = None
    batch_number: str = ""

    @field_validator("product_id", "product_name", "order_uom", "base_uom", "batch_number", mode="before")
    @classmethod
    def _coerce_str(cls, v) -> str:
        return "" if v is None else str(v)


class GoodsReceipt(Document):
    receipt_number: str
    purchase_order_id: str
    order_number: str = ""
    supplier_id: str = ""
    supplier_name: str = ""
    status: GoodsReceiptStatus = GoodsReceiptStatus.draft
    items: list[GoodsReceiptItem] = Field(default_factory=list)
    bill_no: str = ""
    bill_images: list[str] = Field(default_factory=list)
    delivery_note: str = ""
    receipt_date: str = ""
    received_by: str = ""
    notes: str = ""
    replacement_for_return_id: str = ""
    total_amount: float = Field(default=0, ge=0)  # undamaged pack value
    created_by: str = ""
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    confirmed_at: Optional[datetime] = None

    class Settings:
        name = "goods_receipts"
        indexes = [
            IndexModel([("receipt_number", ASCENDING)], unique=True),
            IndexModel([("purchase_order_id", ASCENDING), ("created_at", DESCENDING)]),
            IndexModel([("status", ASCENDING)]),
        ]
