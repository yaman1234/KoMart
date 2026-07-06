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
from app.services.category_sync import resolve_category_fields, propagate_category_rename

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
        category_id=getattr(p, "category_id", "") or "",
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
        # POS catalog: active/seasonal with a billable selling price.
        query = query.find(Product.status != ProductStatus.discontinued)
        query = query.find(Product.selling_price > 0)
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
    supplier_name = ""
    if body.supplier_id:
        supplier = await _resolve_supplier(body.supplier_id)
        supplier_name = supplier.name
    data = body.model_dump()
    data.pop("stock", None)
    category = data.pop("category", None)
    cat_id, cat_name = await resolve_category_fields(
        category_id=data.pop("category_id", None) or None,
        category=category,
    )
    product = Product(
        **data,
        category=cat_name,
        category_id=cat_id,
        supplier_name=supplier_name,
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
    if "category_id" in update_data or "category" in update_data:
        cat_id, cat_name = await resolve_category_fields(
            category_id=update_data.pop("category_id", None),
            category=update_data.get("category"),
        )
        update_data["category_id"] = cat_id
        update_data["category"] = cat_name
    if "supplier_id" in update_data:
        sid = update_data["supplier_id"]
        if sid:
            supplier = await _resolve_supplier(sid)
            update_data["supplier_name"] = supplier.name
        else:
            update_data["supplier_name"] = ""
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
