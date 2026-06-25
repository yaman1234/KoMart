from beanie import Document, Indexed
from pydantic import BaseModel, Field
from typing import Optional
from enum import Enum
from datetime import datetime, timezone
from pymongo import IndexModel, ASCENDING, DESCENDING


class PaymentMethod(str, Enum):
    cash = "cash"
    card = "card"
    esewa = "esewa"
    khalti = "khalti"


class TransactionItem(BaseModel):
    product_id: str
    name: str
    sku: str
    price: float
    quantity: int
    discount: float = 0.0


class Transaction(Document):
    transaction_number: Indexed(str, unique=True)  # type: ignore[valid-type]
    customer_id: Optional[str] = None
    customer_name: Optional[str] = None
    items: list[TransactionItem] = Field(default_factory=list)
    subtotal: float
    discount: float = 0.0
    tax: float
    loyalty_points_redeemed: int = 0
    total: float
    payment_method: PaymentMethod
    created_by: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "transactions"
        indexes = [
            IndexModel([("customer_id", ASCENDING), ("created_at", DESCENDING)]),
            IndexModel([("created_at", DESCENDING)]),
            IndexModel([("payment_method", ASCENDING), ("created_at", DESCENDING)]),
        ]
