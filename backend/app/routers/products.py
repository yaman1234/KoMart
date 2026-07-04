from fastapi import APIRouter, HTTPException, status, Depends, Query, Request
from datetime import datetime, timezone
from math import ceil

from app.auth.dependencies import get_current_user, require_manager_or_above
from app.models.user import User
from app.models.product import Product, ProductStatus, SellMode, product_is_sellable
from app.models.supplier import Supplier
from app.schemas.product import ProductCreate, ProductUpdate, ProductResponse
from app.schemas.common import PaginatedResponse
from app.models.audit_log import AuditModule
from app.services.audit import log_audit, product_snapshot

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
        buy_uom=getattr(p, "buy_uom", None) or p.uom or "pcs",
        uom=p.uom if hasattr(p, "uom") and p.uom else "pcs",
        units_per_buy_uom=getattr(p, "units_per_buy_uom", None) or 1,
        sell_mode=getattr(p, "sell_mode", None) or SellMode.unit,
        cost_price=p.cost_price,
        selling_price=p.selling_price,
        images=p.images,
        nutrition_info=p.nutrition_info,
        allergen_info=p.allergen_info,
        stock=p.stock,
        low_stock_threshold=p.low_stock_threshold,
        status=p.status if hasattr(p, "status") and p.status else ProductStatus.active,
        tags=p.tags if hasattr(p, "tags") and p.tags else [],
        created_at=p.created_at.isoformat(),
        updated_at=p.updated_at.isoformat(),
    )


@router.get("", response_model=PaginatedResponse[ProductResponse])
async def list_products(
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=500),
    search: str = Query(""),
    category: str = Query(""),
    supplier_id: str = Query(""),
    status: str = Query("", pattern="^(|active|discontinued|seasonal)$"),
    sellable_only: bool = Query(False),
    _: User = Depends(get_current_user),
):
    query = Product.find(Product.is_active == True)  # noqa: E712
    if sellable_only:
        # Exclude discontinued only — legacy documents without `status` default to active in the model.
        query = query.find(Product.status != ProductStatus.discontinued)
    elif status:
        query = query.find(Product.status == ProductStatus(status))
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
async def create_product(
    body: ProductCreate,
    request: Request,
    current_user: User = Depends(require_manager_or_above),
):
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
    await log_audit(
        module=AuditModule.products,
        action="create",
        user=current_user,
        request=request,
        entity_type="product",
        entity_id=str(product.id),
        new=product_snapshot(product),
    )
    return _to_response(product)


@router.get("/{product_id}", response_model=ProductResponse)
async def get_product(product_id: str, _: User = Depends(get_current_user)):
    product = await Product.get(product_id)
    if not product:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Product not found")
    return _to_response(product)


@router.patch("/{product_id}", response_model=ProductResponse)
async def update_product(
    product_id: str,
    body: ProductUpdate,
    request: Request,
    current_user: User = Depends(require_manager_or_above),
):
    product = await Product.get(product_id)
    if not product:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Product not found")
    before = product_snapshot(product)
    update_data = {k: v for k, v in body.model_dump().items() if v is not None}
    if "supplier_id" in update_data:
        supplier = await _resolve_supplier(update_data["supplier_id"])
        update_data["supplier_name"] = supplier.name
    update_data["updated_at"] = datetime.now(timezone.utc)
    await product.set(update_data)
    refreshed = await Product.get(product_id)
    after = product_snapshot(refreshed)  # type: ignore[arg-type]

    price_changed = (
        before.get("cost_price") != after.get("cost_price")
        or before.get("selling_price") != after.get("selling_price")
    )
    if price_changed:
        await log_audit(
            module=AuditModule.products,
            action="price_change",
            user=current_user,
            request=request,
            entity_type="product",
            entity_id=product_id,
            previous={
                "cost_price": before.get("cost_price"),
                "selling_price": before.get("selling_price"),
            },
            new={
                "cost_price": after.get("cost_price"),
                "selling_price": after.get("selling_price"),
            },
        )

    await log_audit(
        module=AuditModule.products,
        action="update",
        user=current_user,
        request=request,
        entity_type="product",
        entity_id=product_id,
        previous=before,
        new=after,
    )
    return _to_response(refreshed)  # type: ignore[arg-type]


@router.delete("/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_product(
    product_id: str,
    request: Request,
    current_user: User = Depends(require_manager_or_above),
):
    product = await Product.get(product_id)
    if not product:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Product not found")
    before = product_snapshot(product)
    await product.set({"is_active": False})
    await log_audit(
        module=AuditModule.products,
        action="delete",
        user=current_user,
        request=request,
        entity_type="product",
        entity_id=product_id,
        previous=before,
        new={"is_active": False},
    )
