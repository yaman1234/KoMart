from datetime import datetime, timezone
from enum import Enum
from typing import Optional

from beanie import Document
from pydantic import Field
from pymongo import ASCENDING, IndexModel


class DiscountRuleType(str, Enum):
    product_percent = "product_percent"
    product_flat = "product_flat"
    category_percent = "category_percent"
    category_flat = "category_flat"
    cart_percent = "cart_percent"
    cart_flat = "cart_flat"


class DiscountRule(Document):
    name: str
    code: str = ""
    rule_type: DiscountRuleType
    value: float = Field(ge=0)
    product_id: str = ""
    category: str = ""
    min_cart_total: float = Field(default=0, ge=0)
    max_discount: float = Field(default=0, ge=0)
    starts_at: Optional[datetime] = None
    ends_at: Optional[datetime] = None
    is_active: bool = True
    priority: int = 0
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "discount_rules"
        indexes = [
            IndexModel([("is_active", ASCENDING), ("priority", ASCENDING)]),
            IndexModel([("code", ASCENDING)]),
            IndexModel([("rule_type", ASCENDING), ("product_id", ASCENDING)]),
            IndexModel([("rule_type", ASCENDING), ("category", ASCENDING)]),
        ]
