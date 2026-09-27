from datetime import datetime, timezone
from typing import Optional

from beanie import Document
from pydantic import Field
from pymongo import IndexModel, ASCENDING, DESCENDING


class PurchasePriceHistory(Document):
    """Unit Cost recorded when stock is received from a purchase order."""

    product_id: str
    purchased_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    unit_cost: float = Field(ge=0)  # PO line Unit Cost (buy/pack UOM)
    quantity: int = Field(ge=0)  # received buy-UOM quantity
    base_quantity: int = Field(default=0, ge=0)
    purchase_order_id: str = ""
    order_number: str = ""
    bill_number: Optional[str] = None
    supplier_id: str = ""
    supplier_name: str = ""
    order_uom: str = "pcs"
    units_per_buy_uom: int = Field(default=1, ge=1)

    class Settings:
        name = "purchase_price_history"
        indexes = [
            IndexModel([("product_id", ASCENDING), ("purchased_at", DESCENDING)]),
            IndexModel([("purchase_order_id", ASCENDING)]),
        ]
