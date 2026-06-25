from beanie import Document, Indexed
from pydantic import Field
from typing import Optional
from datetime import datetime, timezone
from pymongo import IndexModel, ASCENDING


class Product(Document):
    name: str
    sku: Indexed(str, unique=True)  # type: ignore[valid-type]
    barcode: Indexed(str)           # type: ignore[valid-type]
    brand: str
    country_of_origin: str
    category: Indexed(str)          # type: ignore[valid-type]
    supplier_id: str
    supplier_name: str
    description: str = ""
    uom: str = "pcs"            # Unit of Measure: pcs, pack, box, kg, g, ml, L …
    cost_price: float
    selling_price: float
    images: list[str] = Field(default_factory=list)
    nutrition_info: Optional[str] = None
    allergen_info: Optional[str] = None
    stock: int = 0
    low_stock_threshold: int = 10
    is_active: bool = True
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "products"
        indexes = [
            IndexModel([("supplier_id", ASCENDING)]),
        ]
