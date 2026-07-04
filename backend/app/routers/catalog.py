from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, status, Query
from math import ceil
from pydantic import BaseModel, Field
from typing import Optional

from app.models.product import Product, ProductStatus
from app.models.discount_rule import DiscountRule, DiscountRuleType
from app.schemas.common import PaginatedResponse
from app.services.store_settings import get_store_settings

router = APIRouter(prefix="/catalog", tags=["Catalog (Public)"])


# ── Response schemas ─────────────────────────────────────────────────────────

class CatalogProductResponse(BaseModel):
    id: str
    name: str
    sku: str
    barcode: str
    brand: str
    country_of_origin: str
    category: str
    description: str
    uom: str
    selling_price: float
    images: list[str]
    nutrition_info: Optional[str]
    allergen_info: Optional[str]
    status: ProductStatus
    tags: list[str] = Field(default_factory=list)
    in_stock: bool = True


class StoreInfoResponse(BaseModel):
    store_name: str
    address: str
    phone: str
    email: str
    logo_url: str


class CatalogOfferResponse(BaseModel):
    id: str
    name: str
    rule_type: str
    value: float
    product_ids: list[str] = Field(default_factory=list)
    category: str
    code: str
    starts_at: Optional[str]
    ends_at: Optional[str]


# ── Helpers ──────────────────────────────────────────────────────────────────

def _to_catalog(p: Product) -> CatalogProductResponse:
    return CatalogProductResponse(
        id=str(p.id),
        name=p.name,
        sku=p.sku,
        barcode=p.barcode,
        brand=p.brand,
        country_of_origin=p.country_of_origin,
        category=p.category,
        description=p.description,
        uom=p.uom if hasattr(p, "uom") and p.uom else "pcs",
        selling_price=p.selling_price,
        images=p.images,
        nutrition_info=p.nutrition_info,
        allergen_info=p.allergen_info,
        status=p.status if hasattr(p, "status") and p.status else ProductStatus.active,
        tags=p.tags if hasattr(p, "tags") and p.tags else [],
        in_stock=p.stock > 0,
    )


# ── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/store-info", response_model=StoreInfoResponse)
async def get_store_info():
    """Public store info — no authentication required."""
    settings = await get_store_settings()
    return StoreInfoResponse(
        store_name=settings.store_name,
        address=settings.address,
        phone=settings.phone,
        email=settings.email,
        logo_url=settings.logo_url,
    )


@router.get("/offers", response_model=list[CatalogOfferResponse])
async def list_offers():
    """Public active offers — no authentication required."""
    now = datetime.now(timezone.utc)
    rules = await DiscountRule.find(
        DiscountRule.is_active == True,  # noqa: E712
    ).sort("-priority", "name").to_list()

    result: list[CatalogOfferResponse] = []
    for rule in rules:
        if rule.starts_at:
            start = rule.starts_at if rule.starts_at.tzinfo else rule.starts_at.replace(tzinfo=timezone.utc)
            if start > now:
                continue
        if rule.ends_at:
            end = rule.ends_at if rule.ends_at.tzinfo else rule.ends_at.replace(tzinfo=timezone.utc)
            if end < now:
                continue
        result.append(CatalogOfferResponse(
            id=str(rule.id),
            name=rule.name,
            rule_type=rule.rule_type.value,
            value=rule.value,
            product_ids=rule.product_ids,
            category=rule.category,
            code=rule.code,
            starts_at=rule.starts_at.isoformat() if rule.starts_at else None,
            ends_at=rule.ends_at.isoformat() if rule.ends_at else None,
        ))
        if len(result) >= 20:
            break

    return result


@router.get("/tags", response_model=list[str])
async def list_tags():
    """Public distinct product tags — no authentication required."""
    pipeline = [
        {"$match": {"is_active": True, "status": {"$ne": ProductStatus.discontinued.value}}},
        {"$unwind": "$tags"},
        {"$group": {"_id": "$tags"}},
        {"$sort": {"_id": 1}},
    ]
    results = await Product.aggregate(pipeline).to_list()
    return [doc["_id"] for doc in results if doc["_id"]]


@router.get("", response_model=PaginatedResponse[CatalogProductResponse])
async def list_catalog(
    page: int = Query(1, ge=1),
    page_size: int = Query(24, ge=1, le=200),
    search: str = Query(""),
    category: str = Query(""),
    tag: str = Query(""),
    sort_by: str = Query("", pattern="^(|selling_price)$"),
    sort_order: str = Query("", pattern="^(|asc|desc)$"),
):
    """Public product catalog — no authentication required."""
    query = Product.find(
        Product.is_active == True,  # noqa: E712
        Product.status != ProductStatus.discontinued,
    )

    if search:
        query = query.find({"$or": [
            {"name": {"$regex": search, "$options": "i"}},
            {"sku": {"$regex": search, "$options": "i"}},
            {"barcode": {"$regex": search, "$options": "i"}},
            {"brand": {"$regex": search, "$options": "i"}},
        ]})
    if category:
        query = query.find(Product.category == category)
    if tag:
        query = query.find({"tags": tag})

    total = await query.count()

    if sort_by and sort_order:
        direction = 1 if sort_order == "asc" else -1
        query = query.sort((sort_by, direction))

    products = await query.skip((page - 1) * page_size).limit(page_size).to_list()

    return PaginatedResponse(
        data=[_to_catalog(p) for p in products],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=ceil(total / page_size) if total else 1,
    )


@router.get("/{product_id}", response_model=CatalogProductResponse)
async def get_catalog_product(product_id: str):
    """Public product detail — no authentication required."""
    product = await Product.get(product_id)
    if not product or not product.is_active:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Product not found")
    if hasattr(product, "status") and product.status == ProductStatus.discontinued:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Product not found")
    return _to_catalog(product)
