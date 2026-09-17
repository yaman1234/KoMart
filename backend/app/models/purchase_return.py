from datetime import datetime, timezone
from enum import Enum
from typing import Optional

from beanie import Document
from pydantic import BaseModel, Field, field_validator
from pymongo import IndexModel, ASCENDING, DESCENDING


class PurchaseReturnStatus(str, Enum):
    draft = "draft"
    posted = "posted"


class PurchaseReturnItem(BaseModel):
    product_id: str
    product_name: str
    return_qty: int = Field(ge=1)  # sell / base UOM
    unit_cost: float = Field(ge=0)  # landed cost per sell/base unit
    line_total: float = Field(ge=0)
    base_uom: str = "pcs"

    @field_validator("product_id", "product_name", "base_uom", mode="before")
    @classmethod
    def _coerce_str(cls, v) -> str:
        if v is None:
            return ""
        return str(v)


class PurchaseReturn(Document):
    return_number: str
    purchase_order_id: str
    order_number: str = ""
    supplier_id: str = ""
    supplier_name: str = ""
    items: list[PurchaseReturnItem] = Field(default_factory=list)
    total_amount: float = Field(default=0, ge=0)
    remarks: str = ""
    status: PurchaseReturnStatus = PurchaseReturnStatus.posted
    payment_method: str = "cash"  # wallet receiving the supplier credit
    return_date: str = ""  # YYYY-MM-DD
    created_by: str = ""
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    posted_at: Optional[datetime] = None

    class Settings:
        name = "purchase_returns"
        indexes = [
            IndexModel([("return_number", ASCENDING)], unique=True),
            IndexModel([("purchase_order_id", ASCENDING), ("created_at", DESCENDING)]),
            IndexModel([("supplier_id", ASCENDING), ("return_date", DESCENDING)]),
            IndexModel([("status", ASCENDING)]),
        ]
