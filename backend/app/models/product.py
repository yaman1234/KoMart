from beanie import Document, Indexed
from pydantic import Field
from typing import Optional
from datetime import datetime, timezone
from enum import Enum
from pymongo import IndexModel, ASCENDING


class ProductStatus(str, Enum):
    active = "active"
    discontinued = "discontinued"
    seasonal = "seasonal"


SELLABLE_PRODUCT_STATUSES = frozenset({ProductStatus.active, ProductStatus.seasonal})


def product_is_sellable(product: "Product") -> bool:
    return product.is_active and product.status in SELLABLE_PRODUCT_STATUSES


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
    status: ProductStatus = ProductStatus.active
    tags: list[str] = Field(default_factory=list)
    is_active: bool = True
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "products"
        indexes = [
            IndexModel([("supplier_id", ASCENDING)]),
            IndexModel([("is_active", ASCENDING), ("name", ASCENDING)]),
            IndexModel([("is_active", ASCENDING), ("stock", ASCENDING)]),
            IndexModel([("is_active", ASCENDING), ("category", ASCENDING)]),
            IndexModel([("is_active", ASCENDING), ("status", ASCENDING), ("name", ASCENDING)]),
        ]
