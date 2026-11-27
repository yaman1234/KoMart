from pydantic import BaseModel, Field
from typing import Optional

from app.models.supplier import SupplierPaymentDetail


class SupplierCreate(BaseModel):
    name: str
    country: str
    contact_person: str
    phone: str
    email: Optional[str] = None
    address: str
    payment_details: list[SupplierPaymentDetail] = Field(default_factory=list, max_length=10)


class SupplierUpdate(BaseModel):
    name: Optional[str] = None
    country: Optional[str] = None
    contact_person: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    payment_details: Optional[list[SupplierPaymentDetail]] = Field(default=None, max_length=10)


class SupplierResponse(BaseModel):
    id: str
    name: str
    country: str
    contact_person: str
    phone: str
    email: Optional[str]
    address: str
    payment_details: list[SupplierPaymentDetail] = Field(default_factory=list)
    created_at: str
    po_count: int = 0
    open_po_count: int = 0
    total_spend: float = 0.0
    total_paid: float = 0.0
    due_amount: float = 0.0
    last_order_date: Optional[str] = None


class SupplierSummary(BaseModel):
    total_suppliers: int = 0
    suppliers_with_due: int = 0
    total_due_amount: float = 0.0
    suppliers_with_open_orders: int = 0
    total_open_orders_amount: float = 0.0
    total_spend_amount: float = 0.0
    suppliers_missing_payment: int = 0


class SupplierListResponse(BaseModel):
    data: list[SupplierResponse]
    total: int
    page: int
    page_size: int
    total_pages: int
    summary: SupplierSummary = Field(default_factory=SupplierSummary)
