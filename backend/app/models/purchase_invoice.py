from datetime import datetime, timezone
from enum import Enum
from typing import Optional

from beanie import Document
from pydantic import Field
from pymongo import IndexModel, ASCENDING, DESCENDING


class InvoiceStatus(str, Enum):
    unpaid = "unpaid"
    partial = "partial"
    paid = "paid"
    overdue = "overdue"
    cancelled = "cancelled"


class PurchaseInvoice(Document):
    invoice_number: str
    supplier_invoice_no: str = ""
    purchase_order_id: str
    order_number: str = ""
    goods_receipt_ids: list[str] = Field(default_factory=list)
    supplier_id: str = ""
    supplier_name: str = ""
    invoice_date: str = ""
    due_date: str = ""
    subtotal: float = Field(default=0, ge=0)
    discount: float = Field(default=0, ge=0)
    tax: float = Field(default=0, ge=0)
    shipping: float = Field(default=0, ge=0)
    other_charges: float = Field(default=0, ge=0)
    total_amount: float = Field(default=0, ge=0)
    amount_paid: float = Field(default=0, ge=0)
    status: InvoiceStatus = InvoiceStatus.unpaid
    notes: str = ""
    created_by: str = ""
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    @property
    def outstanding(self) -> float:
        return round(max(0.0, float(self.total_amount or 0) - float(self.amount_paid or 0)), 2)

    class Settings:
        name = "purchase_invoices"
        indexes = [
            IndexModel([("invoice_number", ASCENDING)], unique=True),
            IndexModel([("purchase_order_id", ASCENDING), ("created_at", DESCENDING)]),
            IndexModel([("supplier_id", ASCENDING), ("status", ASCENDING)]),
            IndexModel([("status", ASCENDING), ("due_date", ASCENDING)]),
        ]


class SupplierPayment(Document):
    payment_number: str
    purchase_invoice_id: str
    purchase_order_id: str = ""
    supplier_id: str = ""
    supplier_name: str = ""
    amount: float = Field(gt=0)
    payment_date: str = ""
    payment_method: str = "cash"
    reference_number: str = ""
    bill_no: str = ""
    notes: str = ""
    expense_id: str = ""
    created_by: str = ""
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "supplier_payments"
        indexes = [
            IndexModel([("payment_number", ASCENDING)], unique=True),
            IndexModel([("purchase_invoice_id", ASCENDING), ("created_at", DESCENDING)]),
            IndexModel([("purchase_order_id", ASCENDING)]),
            IndexModel([("supplier_id", ASCENDING), ("payment_date", DESCENDING)]),
        ]


class SupplierCredit(Document):
    """Credit balance from purchase returns (settlement_type=credit)."""

    supplier_id: str
    supplier_name: str = ""
    purchase_return_id: str = ""
    purchase_order_id: str = ""
    amount: float = Field(gt=0)
    remaining_amount: float = Field(ge=0)
    notes: str = ""
    created_by: str = ""
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "supplier_credits"
        indexes = [
            IndexModel([("supplier_id", ASCENDING), ("created_at", DESCENDING)]),
            IndexModel([("purchase_return_id", ASCENDING)]),
        ]
