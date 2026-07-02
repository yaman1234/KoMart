from pydantic import BaseModel, Field
from typing import Optional
from app.models.transaction import PaymentMethod, TransactionItem, AppliedPromotion


class TransactionCreate(BaseModel):
    customer_id: Optional[str] = None
    customer_name: Optional[str] = None
    items: list[TransactionItem]
    subtotal: float
    discount: float = Field(ge=0, default=0.0)
    promotion_discount: float = Field(ge=0, default=0.0)
    manual_discount: float = Field(ge=0, default=0.0)
    applied_promotions: list[AppliedPromotion] = Field(default_factory=list)
    coupon_code: str = ""
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
    promotion_discount: float = 0.0
    manual_discount: float = 0.0
    applied_promotions: list[AppliedPromotion] = Field(default_factory=list)
    coupon_code: str = ""
    tax: float
    loyalty_points_redeemed: int
    total: float
    total_cost: float = 0.0
    payment_method: PaymentMethod
    created_by: str
    cashier_id: Optional[str] = None
    created_at: str


class TransactionUpdate(BaseModel):
    customer_id: Optional[str] = None
    customer_name: Optional[str] = None
    payment_method: Optional[PaymentMethod] = None
    discount: Optional[float] = Field(None, ge=0)
    loyalty_points_redeemed: Optional[int] = Field(None, ge=0)


class TransactionItemResponse(TransactionItem):
    pass
