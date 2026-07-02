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


class BatchAllocation(BaseModel):
    batch_id: str
    quantity: int
    unit_cost: float = 0.0


class TransactionItem(BaseModel):
    product_id: str
    name: str
    sku: str
    price: float
    quantity: int
    discount: float = 0.0
    list_price: float = 0.0
    unit_cost: float = 0.0
    category: str = ""
    batch_allocations: list[BatchAllocation] = Field(default_factory=list)


class AppliedPromotion(BaseModel):
    rule_id: str
    name: str
    amount: float


class Transaction(Document):
    transaction_number: Indexed(str, unique=True)  # type: ignore[valid-type]
    customer_id: Optional[str] = None
    customer_name: Optional[str] = None
    items: list[TransactionItem] = Field(default_factory=list)
    subtotal: float
    discount: float = 0.0
    promotion_discount: float = 0.0
    manual_discount: float = 0.0
    applied_promotions: list[AppliedPromotion] = Field(default_factory=list)
    coupon_code: str = ""
    tax: float
    loyalty_points_redeemed: int = 0
    total: float
    total_cost: float = 0.0
    payment_method: PaymentMethod
    created_by: str
    cashier_id: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "transactions"
        indexes = [
            IndexModel([("customer_id", ASCENDING), ("created_at", DESCENDING)]),
            IndexModel([("created_at", DESCENDING)]),
            IndexModel([("payment_method", ASCENDING), ("created_at", DESCENDING)]),
            IndexModel([("cashier_id", ASCENDING), ("created_at", DESCENDING)]),
        ]
