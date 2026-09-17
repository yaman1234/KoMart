from datetime import datetime, timezone

from beanie import Document
from pydantic import Field
from pymongo import IndexModel, ASCENDING, DESCENDING


class PurchasePriceHistory(Document):
    """One row per PO receive line — durable purchase price event for a product."""

    product_id: str
    purchase_order_id: str
    order_number: str
    supplier_id: str = ""
    supplier_name: str = ""
    unit_cost: float = Field(ge=0)  # pack / buy-UOM price
    landed_unit_cost: float = Field(ge=0)  # per sell/base UOM
    units_per_buy_uom: int = Field(default=1, ge=1)
    order_uom: str = "pcs"
    base_uom: str = "pcs"
    quantity: int = Field(ge=1)  # packs received in this event
    bill_no: str = ""
    received_date: str  # AD YYYY-MM-DD
    created_by: str = ""
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "purchase_price_history"
        indexes = [
            IndexModel([("product_id", ASCENDING), ("received_date", DESCENDING), ("created_at", DESCENDING)]),
            IndexModel([("purchase_order_id", ASCENDING)]),
        ]
