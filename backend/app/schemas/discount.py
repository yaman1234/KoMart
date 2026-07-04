from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field

from app.models.discount_rule import DiscountRuleType
from app.models.transaction import AppliedPromotion


class DiscountRuleCreate(BaseModel):
    name: str
    code: str = ""
    rule_type: DiscountRuleType
    value: float = Field(ge=0)
    product_ids: list[str] = Field(default_factory=list)
    category: str = ""
    min_cart_total: float = Field(default=0, ge=0)
    max_discount: float = Field(default=0, ge=0)
    starts_at: Optional[datetime] = None
    ends_at: Optional[datetime] = None
    is_active: bool = True
    priority: int = 0


class DiscountRuleUpdate(BaseModel):
    name: Optional[str] = None
    code: Optional[str] = None
    rule_type: Optional[DiscountRuleType] = None
    value: Optional[float] = Field(default=None, ge=0)
    product_ids: Optional[list[str]] = None
    category: Optional[str] = None
    min_cart_total: Optional[float] = Field(default=None, ge=0)
    max_discount: Optional[float] = Field(default=None, ge=0)
    starts_at: Optional[datetime] = None
    ends_at: Optional[datetime] = None
    is_active: Optional[bool] = None
    priority: Optional[int] = None


class DiscountRuleResponse(BaseModel):
    id: str
    name: str
    code: str
    rule_type: DiscountRuleType
    value: float
    product_ids: list[str]
    category: str
    min_cart_total: float
    max_discount: float
    starts_at: Optional[str] = None
    ends_at: Optional[str] = None
    is_active: bool
    priority: int
    created_at: str
    updated_at: str


class EvaluateCartItem(BaseModel):
    product_id: str
    price: float = Field(gt=0)
    quantity: int = Field(ge=1)
    category: str = ""


class EvaluateDiscountRequest(BaseModel):
    items: list[EvaluateCartItem]
    coupon_code: str = ""


class EvaluatedLineItem(BaseModel):
    product_id: str
    per_unit_discount: float
    line_discount: float


class EvaluateDiscountResponse(BaseModel):
    line_items: list[EvaluatedLineItem]
    line_discount_total: float
    cart_discount: float
    promotion_discount_total: float
    applied_promotions: list[AppliedPromotion]
