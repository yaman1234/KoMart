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


class SellMode(str, Enum):
    unit = "unit"    # sell whole sell-uom unit only (e.g. pack)
    piece = "piece"  # sell individual pieces only
    both = "both"    # sell pack or pieces


SELLABLE_PRODUCT_STATUSES = frozenset({ProductStatus.active, ProductStatus.seasonal})


def product_is_sellable(product: "Product") -> bool:
    return product.is_active and product.status in SELLABLE_PRODUCT_STATUSES


def product_is_billable(product: "Product") -> bool:
    """Sellable in POS — requires a positive selling price."""
    return product_is_sellable(product) and product.selling_price > 0


class Product(Document):
    name: str
    sku: Indexed(str, unique=True)  # type: ignore[valid-type]
    barcode: str = ""
    brand: str = ""
    country_of_origin: str = ""
    category: Indexed(str) = ""     # type: ignore[valid-type]
    category_id: str = ""  # canonical FK; category string kept for search/display
    supplier_id: str = ""
    supplier_name: str = ""
    description: str = ""
    buy_uom: str = "pcs"          # how purchased from supplier
    uom: str = "pcs"              # sell UOM: pcs, pack, box, kg, g, ml, L …
    units_per_buy_uom: int = Field(default=1, ge=1)
    sell_mode: SellMode = SellMode.unit
    cost_price: float = Field(ge=0)
    selling_price: float = Field(ge=0)
    images: list[str] = Field(default_factory=list)
    nutrition_info: Optional[str] = None
    allergen_info: Optional[str] = None
    stock: int = Field(default=0, ge=0)
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
            IndexModel([("tags", ASCENDING)]),
        ]
