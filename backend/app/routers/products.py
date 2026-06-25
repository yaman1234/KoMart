from fastapi import APIRouter, HTTPException, status, Depends, Query
from datetime import datetime, timezone
from math import ceil

from app.auth.dependencies import get_current_user, require_admin
from app.models.user import User
from app.models.product import Product
from app.models.supplier import Supplier
from app.schemas.product import ProductCreate, ProductUpdate, ProductResponse
from app.schemas.common import PaginatedResponse

router = APIRouter(prefix="/products", tags=["Products"])


async def _resolve_supplier(supplier_id: str) -> Supplier:
    supplier = await Supplier.get(supplier_id)
    if not supplier:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Supplier not found")
    return supplier


def _to_response(p: Product) -> ProductResponse:
    return ProductResponse(
        id=str(p.id),
        name=p.name,
        sku=p.sku,
        barcode=p.barcode,
        brand=p.brand,
        country_of_origin=p.country_of_origin,
        category=p.category,
        supplier_id=p.supplier_id,
        supplier_name=p.supplier_name,
        description=p.description,
        uom=p.uom if hasattr(p, "uom") and p.uom else "pcs",
        cost_price=p.cost_price,
        selling_price=p.selling_price,
        images=p.images,
        nutrition_info=p.nutrition_info,
        allergen_info=p.allergen_info,
        stock=p.stock,
        low_stock_threshold=p.low_stock_threshold,
        created_at=p.created_at.isoformat(),
        updated_at=p.updated_at.isoformat(),
    )


@router.get("", response_model=PaginatedResponse[ProductResponse])
async def list_products(
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    search: str = Query(""),
    category: str = Query(""),
    supplier_id: str = Query(""),
    _: User = Depends(get_current_user),
):
    query = Product.find(Product.is_active == True)  # noqa: E712
    if search:
        query = query.find({"$or": [
            {"name": {"$regex": search, "$options": "i"}},
            {"sku": {"$regex": search, "$options": "i"}},
            {"barcode": {"$regex": search, "$options": "i"}},
        ]})
    if category:
        query = query.find(Product.category == category)
    if supplier_id:
        query = query.find(Product.supplier_id == supplier_id)

    total = await query.count()
    products = await query.skip((page - 1) * page_size).limit(page_size).to_list()

    return PaginatedResponse(
        data=[_to_response(p) for p in products],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=ceil(total / page_size) if total else 1,
    )


@router.post("", response_model=ProductResponse, status_code=status.HTTP_201_CREATED)
async def create_product(body: ProductCreate, _: User = Depends(require_admin)):
    if await Product.find_one(Product.sku == body.sku):
        raise HTTPException(status.HTTP_409_CONFLICT, detail="SKU already exists")
    supplier = await _resolve_supplier(body.supplier_id)
    data = body.model_dump()
    data.pop("stock", None)
    product = Product(
        **data,
        supplier_name=supplier.name,
        stock=0,
    )
    await product.insert()
    return _to_response(product)


@router.get("/{product_id}", response_model=ProductResponse)
async def get_product(product_id: str, _: User = Depends(get_current_user)):
    product = await Product.get(product_id)
    if not product:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Product not found")
    return _to_response(product)


@router.patch("/{product_id}", response_model=ProductResponse)
async def update_product(
    product_id: str, body: ProductUpdate, _: User = Depends(require_admin)
):
    product = await Product.get(product_id)
    if not product:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Product not found")
    update_data = {k: v for k, v in body.model_dump().items() if v is not None}
    if "supplier_id" in update_data:
        supplier = await _resolve_supplier(update_data["supplier_id"])
        update_data["supplier_name"] = supplier.name
    update_data["updated_at"] = datetime.now(timezone.utc)
    await product.set(update_data)
    refreshed = await Product.get(product_id)
    return _to_response(refreshed)  # type: ignore[arg-type]


@router.delete("/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_product(product_id: str, _: User = Depends(require_admin)):
    product = await Product.get(product_id)
    if not product:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Product not found")
    await product.set({"is_active": False})
