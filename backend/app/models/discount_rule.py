from datetime import datetime, timezone
from enum import Enum
from typing import Any, Optional

from beanie import Document
from pydantic import Field, model_validator
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
    product_ids: list[str] = Field(default_factory=list)
    category: str = ""
    min_cart_total: float = Field(default=0, ge=0)
    min_line_qty: int = Field(default=0, ge=0)
    sell_uom: str = ""
    max_discount: float = Field(default=0, ge=0)
    starts_at: Optional[datetime] = None
    ends_at: Optional[datetime] = None
    is_active: bool = True
    priority: int = 0
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    @model_validator(mode="before")
    @classmethod
    def migrate_product_id(cls, data: Any) -> Any:
        """Convert legacy single product_id to product_ids list."""
        if isinstance(data, dict):
            old = data.pop("product_id", None)
            if old and "product_ids" not in data:
                data["product_ids"] = [old] if old else []
        return data

    class Settings:
        name = "discount_rules"
        indexes = [
            IndexModel([("is_active", ASCENDING), ("priority", ASCENDING)]),
            IndexModel(
                [("code", ASCENDING)],
                unique=True,
                partialFilterExpression={"code": {"$gt": ""}},
            ),
            IndexModel([("rule_type", ASCENDING), ("product_ids", ASCENDING)]),
            IndexModel([("rule_type", ASCENDING), ("category", ASCENDING)]),
        ]
