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
