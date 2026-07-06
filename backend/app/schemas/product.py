from pydantic import BaseModel, Field, field_validator
from typing import Optional

from app.models.product import ProductStatus, SellMode


class ProductCreate(BaseModel):
    name: str
    sku: str
    barcode: str = ""
    brand: str = ""
    country_of_origin: str = ""
    category: str = ""
    category_id: str = ""
    supplier_id: str = ""
    description: str = ""
    buy_uom: str = "pcs"
    uom: str = "pcs"
    units_per_buy_uom: int = Field(default=1, ge=1)
    sell_mode: SellMode = SellMode.unit
    cost_price: float = Field(ge=0)
    selling_price: float = Field(ge=0)
    images: list[str] = Field(default_factory=list)
    nutrition_info: Optional[str] = None
    allergen_info: Optional[str] = None
    stock: int = Field(ge=0, default=0)
    low_stock_threshold: int = Field(ge=0, default=10)
    status: ProductStatus = ProductStatus.active
    tags: list[str] = Field(default_factory=list)

    @field_validator("tags", mode="before")
    @classmethod
    def normalize_tags(cls, value: object) -> list[str]:
        if not value:
            return []
        seen: set[str] = set()
        out: list[str] = []
        for raw in value if isinstance(value, list) else []:
            tag = str(raw).strip()
            key = tag.lower()
            if tag and key not in seen:
                seen.add(key)
                out.append(tag)
        return out


class ProductUpdate(BaseModel):
    name: Optional[str] = None
    brand: Optional[str] = None
    country_of_origin: Optional[str] = None
    category: Optional[str] = None
    category_id: Optional[str] = None
    supplier_id: Optional[str] = None
    barcode: Optional[str] = None
    description: Optional[str] = None
    buy_uom: Optional[str] = None
    uom: Optional[str] = None
    units_per_buy_uom: Optional[int] = Field(default=None, ge=1)
    sell_mode: Optional[SellMode] = None
    cost_price: Optional[float] = Field(default=None, ge=0)
    selling_price: Optional[float] = Field(default=None, ge=0)
    images: Optional[list[str]] = None
    nutrition_info: Optional[str] = None
    allergen_info: Optional[str] = None
    low_stock_threshold: Optional[int] = Field(default=None, ge=0)
    status: Optional[ProductStatus] = None
    tags: Optional[list[str]] = None

    @field_validator("tags", mode="before")
    @classmethod
    def normalize_tags(cls, value: object) -> list[str] | None:
        if value is None:
            return None
        seen: set[str] = set()
        out: list[str] = []
        for raw in value if isinstance(value, list) else []:
            tag = str(raw).strip()
            key = tag.lower()
            if tag and key not in seen:
                seen.add(key)
                out.append(tag)
        return out


class ProductResponse(BaseModel):
    id: str
    name: str
    sku: str
    barcode: str
    brand: str
    country_of_origin: str
    category: str
    category_id: str = ""
    supplier_id: str
    supplier_name: str
    description: str
    buy_uom: str
    uom: str
    units_per_buy_uom: int
    sell_mode: SellMode
    cost_price: float
    selling_price: float
    images: list[str]
    nutrition_info: Optional[str]
    allergen_info: Optional[str]
    stock: int
    low_stock_threshold: int
    status: ProductStatus
    tags: list[str] = Field(default_factory=list)
    created_at: str
    updated_at: str
