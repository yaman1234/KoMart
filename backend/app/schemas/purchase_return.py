from pydantic import BaseModel, Field
from typing import Optional

from app.models.purchase_return import (
    PurchaseReturnMode,
    PurchaseReturnStatus,
    ReturnReason,
    ReturnSettlementType,
)


class PurchaseReturnItemCreate(BaseModel):
    product_id: str
    return_qty: int = Field(ge=1)


class PurchaseReturnCreate(BaseModel):
    return_mode: PurchaseReturnMode = PurchaseReturnMode.po_linked
    purchase_order_id: str = ""
    supplier_id: str = ""
    items: list[PurchaseReturnItemCreate] = Field(min_length=1)
    remarks: str = ""
    payment_method: str = "cash"
    return_date: Optional[str] = None
    settlement_type: ReturnSettlementType = ReturnSettlementType.refund
    reason: ReturnReason = ReturnReason.other


class PurchaseReturnClose(BaseModel):
    payment_method: Optional[str] = None
    amount_received: Optional[float] = Field(default=None, ge=0)
    remarks: str = ""
    received_date: Optional[str] = None


class PurchaseReturnWriteOff(BaseModel):
    reason: str = Field(min_length=1)


class PurchaseReturnItemResponse(BaseModel):
    product_id: str
    product_name: str
    return_qty: int
    unit_cost: float
    line_total: float
    base_uom: str = "pcs"


class PurchaseReturnPaymentResponse(BaseModel):
    id: str
    date: str
    amount: float
    wallet: str
    remarks: str = ""
    created_by: str = ""


class PurchaseReturnResponse(BaseModel):
    id: str
    return_number: str
    return_mode: PurchaseReturnMode
    purchase_order_id: str = ""
    order_number: str = ""
    supplier_id: str
    supplier_name: str
    items: list[PurchaseReturnItemResponse]
    total_amount: float
    amount_received: float = 0
    write_off_amount: float = 0
    write_off_reason: str = ""
    remarks: str
    reason: ReturnReason
    settlement_type: ReturnSettlementType
    status: PurchaseReturnStatus
    payment_method: str
    return_date: str
    created_by: str
    created_at: str
    updated_at: str
    confirmed_at: Optional[str] = None
    closed_at: Optional[str] = None
    write_off_at: Optional[str] = None
    amount_outstanding: float = 0
    payments: list[PurchaseReturnPaymentResponse] = Field(default_factory=list)


class ReturnableLineResponse(BaseModel):
    product_id: str
    product_name: str
    available_qty: int
    unit_cost: float
    base_uom: str
    received_quantity: int = 0
    units_per_buy_uom: int = 1
    sku: str = ""


class PurchaseReturnListResponse(BaseModel):
    data: list[PurchaseReturnResponse]
    total: int


class PurchaseReturnSummaryResponse(BaseModel):
    outstanding_receivable: float = 0.0
    refunds_received_today: float = 0.0
    refunds_received_month: float = 0.0
    open_requested_count: int = 0
