from pydantic import BaseModel, Field
from typing import Optional
from app.models.transaction import PaymentMethod, TransactionItem


class TransactionCreate(BaseModel):
    customer_id: Optional[str] = None
    customer_name: Optional[str] = None
    items: list[TransactionItem]
    subtotal: float
    discount: float = Field(ge=0, default=0.0)
    tax: float = Field(ge=0)
    loyalty_points_redeemed: int = Field(ge=0, default=0)
    total: float
    payment_method: PaymentMethod
    created_by: str


class TransactionResponse(BaseModel):
    id: str
    transaction_number: str
    customer_id: Optional[str]
    customer_name: Optional[str]
    items: list[TransactionItem]
    subtotal: float
    discount: float
    tax: float
    loyalty_points_redeemed: int
    total: float
    payment_method: PaymentMethod
    created_by: str
    created_at: str


class TransactionItemResponse(TransactionItem):
    pass
