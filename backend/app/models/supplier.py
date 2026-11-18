from beanie import Document
from pydantic import BaseModel, Field, field_validator
from typing import Any, Optional
from datetime import datetime, timezone
from enum import Enum
from pymongo import ASCENDING, IndexModel


class SupplierPaymentMethod(str, Enum):
    esewa = "esewa"
    fonepay = "fonepay"
    khalti = "khalti"
    bank = "bank"
    other = "other"


class SupplierPaymentDetail(BaseModel):
    method: SupplierPaymentMethod
    label: Optional[str] = Field(default=None, max_length=80)
    account_name: Optional[str] = Field(default=None, max_length=120)
    account_number: Optional[str] = Field(default=None, max_length=64)
    bank_name: Optional[str] = Field(default=None, max_length=120)
    qr_image_url: Optional[str] = Field(default=None, max_length=2048)

    @field_validator("method", mode="before")
    @classmethod
    def _normalize_method(cls, value: Any) -> Any:
        if isinstance(value, str):
            return value.strip().lower()
        return value

    @field_validator(
        "label",
        "account_name",
        "account_number",
        "bank_name",
        "qr_image_url",
        mode="before",
    )
    @classmethod
    def _blank_to_none(cls, value: Any) -> Any:
        if value is None:
            return None
        if isinstance(value, str):
            text = value.strip()
            return text or None
        return value

    @field_validator("qr_image_url")
    @classmethod
    def _http_qr_url(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        lowered = value.lower()
        if not (lowered.startswith("https://") or lowered.startswith("http://")):
            raise ValueError("qr_image_url must be an http(s) URL")
        return value


class Supplier(Document):
    name: str
    country: str
    contact_person: str
    phone: str
    email: Optional[str] = None
    address: str
    is_active: bool = True
    payment_details: list[SupplierPaymentDetail] = Field(default_factory=list, max_length=10)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    @field_validator("payment_details", mode="before")
    @classmethod
    def _default_payment_details(cls, value: Any) -> Any:
        if value is None:
            return []
        return value

    class Settings:
        name = "suppliers"
        indexes = [
            IndexModel([("name", ASCENDING)]),
            IndexModel([("is_active", ASCENDING), ("name", ASCENDING)]),
        ]
