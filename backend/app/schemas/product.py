from pydantic import BaseModel, Field
from typing import Optional


class ProductCreate(BaseModel):
    name: str
    sku: str
    barcode: str
    brand: str
    country_of_origin: str
    category: str
    supplier_id: str
    description: str = ""
    uom: str = "pcs"
    cost_price: float = Field(ge=0)
    selling_price: float = Field(gt=0)
    images: list[str] = Field(default_factory=list)
    nutrition_info: Optional[str] = None
    allergen_info: Optional[str] = None
    stock: int = Field(ge=0, default=0)
    low_stock_threshold: int = Field(ge=0, default=10)


class ProductUpdate(BaseModel):
    name: Optional[str] = None
    brand: Optional[str] = None
    country_of_origin: Optional[str] = None
    category: Optional[str] = None
    supplier_id: Optional[str] = None
    description: Optional[str] = None
    uom: Optional[str] = None
    cost_price: Optional[float] = Field(default=None, ge=0)
    selling_price: Optional[float] = Field(default=None, gt=0)
    images: Optional[list[str]] = None
    nutrition_info: Optional[str] = None
    allergen_info: Optional[str] = None
    low_stock_threshold: Optional[int] = Field(default=None, ge=0)


class ProductResponse(BaseModel):
    id: str
    name: str
    sku: str
    barcode: str
    brand: str
    country_of_origin: str
    category: str
    supplier_id: str
    supplier_name: str
    description: str
    uom: str
    cost_price: float
    selling_price: float
    images: list[str]
    nutrition_info: Optional[str]
    allergen_info: Optional[str]
    stock: int
    low_stock_threshold: int
    created_at: str
    updated_at: str
