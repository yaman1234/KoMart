from pydantic import BaseModel
from typing import Optional


class SupplierCreate(BaseModel):
    name: str
    country: str
    contact_person: str
    phone: str
    email: Optional[str] = None
    address: str


class SupplierUpdate(BaseModel):
    name: Optional[str] = None
    country: Optional[str] = None
    contact_person: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None


class SupplierResponse(BaseModel):
    id: str
    name: str
    country: str
    contact_person: str
    phone: str
    email: Optional[str]
    address: str
    created_at: str
