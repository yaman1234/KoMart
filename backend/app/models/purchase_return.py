from datetime import datetime, timezone
from enum import Enum
from typing import Optional

from beanie import Document
from pydantic import BaseModel, Field, field_validator
from pymongo import IndexModel, ASCENDING, DESCENDING


class PurchaseReturnMode(str, Enum):
    po_linked = "po_linked"
    supplier = "supplier"


class PurchaseReturnStatus(str, Enum):
    requested = "requested"
    closed = "closed"


class ReturnSettlementType(str, Enum):
    refund = "refund"
    reduce_payable = "reduce_payable"
    stock_only = "stock_only"


class ReturnReason(str, Enum):
    damaged = "damaged"
    wrong_item = "wrong_item"
    expired = "expired"
    quality = "quality"
    other = "other"


class PurchaseReturnItem(BaseModel):
    product_id: str
    product_name: str
    return_qty: int = Field(ge=1)
    unit_cost: float = Field(ge=0)
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
    return_mode: PurchaseReturnMode = PurchaseReturnMode.po_linked
    purchase_order_id: str = ""
    order_number: str = ""
    supplier_id: str = ""
    supplier_name: str = ""
    items: list[PurchaseReturnItem] = Field(default_factory=list)
    total_amount: float = Field(default=0, ge=0)
    remarks: str = ""
    reason: ReturnReason = ReturnReason.other
    settlement_type: ReturnSettlementType = ReturnSettlementType.refund
    status: PurchaseReturnStatus = PurchaseReturnStatus.requested
    payment_method: str = "cash"
    return_date: str = ""
    created_by: str = ""
    confirmed_at: Optional[datetime] = None
    closed_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    @field_validator("status", mode="before")
    @classmethod
    def _legacy_status(cls, v):
        if v in (None, "", "confirmed", "cancelled"):
            return PurchaseReturnStatus.closed
        return v

    class Settings:
        name = "purchase_returns"
        indexes = [
            IndexModel([("return_number", ASCENDING)], unique=True),
            IndexModel([("purchase_order_id", ASCENDING), ("created_at", DESCENDING)]),
            IndexModel([("supplier_id", ASCENDING), ("return_date", DESCENDING)]),
            IndexModel([("status", ASCENDING)]),
            IndexModel([("return_mode", ASCENDING)]),
        ]
