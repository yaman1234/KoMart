from pydantic import BaseModel, Field
from typing import Optional

from app.models.purchase_return import (
    PurchaseReturnStatus,
    ReturnReason,
    ReturnSettlementType,
)


class PurchaseReturnItemCreate(BaseModel):
    product_id: str
    return_qty: int = Field(ge=1)


class PurchaseReturnCreate(BaseModel):
    purchase_order_id: str
    items: list[PurchaseReturnItemCreate] = Field(min_length=1)
    remarks: str = ""
    payment_method: str = "cash"
    return_date: Optional[str] = None
    settlement_type: ReturnSettlementType = ReturnSettlementType.refund
    reason: ReturnReason = ReturnReason.other
    goods_receipt_id: str = ""
    bill_no: Optional[str] = None
    # When True (default for manager shortcut), confirm immediately
    confirm_immediately: bool = True


class PurchaseReturnItemResponse(BaseModel):
    product_id: str
    product_name: str
    return_qty: int
    unit_cost: float
    line_total: float
    base_uom: str = "pcs"


class PurchaseReturnResponse(BaseModel):
    id: str
    return_number: str
    purchase_order_id: str
    order_number: str
    goods_receipt_id: str = ""
    supplier_id: str
    supplier_name: str
    items: list[PurchaseReturnItemResponse]
    total_amount: float
    remarks: str
    reason: ReturnReason = ReturnReason.other
    settlement_type: ReturnSettlementType = ReturnSettlementType.refund
    status: PurchaseReturnStatus
    payment_method: str
    bill_no: str = ""
    return_date: str
    approved_by: str = ""
    created_by: str
    created_at: str
    updated_at: str
    posted_at: Optional[str] = None
    confirmed_at: Optional[str] = None


class ReturnableLineResponse(BaseModel):
    product_id: str
    product_name: str
    available_qty: int
    unit_cost: float
    base_uom: str
    received_quantity: int
    units_per_buy_uom: int


class PurchaseReturnListResponse(BaseModel):
    data: list[PurchaseReturnResponse]
    total: int
