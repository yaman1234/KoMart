from fastapi import APIRouter, Depends, HTTPException, Query, status
from math import ceil

from app.auth.dependencies import get_current_user, require_manager_or_above
from app.models.user import User
from app.models.product import Product
from app.models.inventory import InventoryBatch
from app.schemas.inventory import (
    BatchCreate,
    StockAdjustmentCreate,
    InventoryItemResponse,
    InventoryStatsResponse,
    BatchResponse,
)
from app.schemas.common import PaginatedResponse, MessageResponse
from app.services.stock import (
    adjust_stock,
    expiring_product_ids,
    get_sorted_batches,
    nearest_expiry,
    receive_stock,
)

router = APIRouter(prefix="/inventory", tags=["Inventory"])


def _batch_response(batch: InventoryBatch) -> BatchResponse:
    return BatchResponse(
        id=str(batch.id),
        product_id=batch.product_id,
        batch_number=batch.batch_number,
        quantity=batch.quantity,
        expiry_date=batch.expiry_date,
        purchase_order_id=batch.purchase_order_id,
        received_at=batch.received_at.isoformat(),
    )


def _item_response(product: Product, batches: list[InventoryBatch]) -> InventoryItemResponse:
    active_batches = [batch for batch in batches if batch.quantity > 0]
    return InventoryItemResponse(
        id=str(product.id),
        name=product.name,
        sku=product.sku,
        barcode=product.barcode,
        category=product.category,
        supplier_id=product.supplier_id,
        supplier_name=product.supplier_name,
        stock=product.stock,
        low_stock_threshold=product.low_stock_threshold,
        cost_price=product.cost_price,
        selling_price=product.selling_price,
        batches=[_batch_response(batch) for batch in batches],
        batch_count=len(active_batches),
        nearest_expiry=nearest_expiry(batches),
    )


@router.get("/stats", response_model=InventoryStatsResponse)
async def inventory_stats(_: User = Depends(get_current_user)):
    products = await Product.find(Product.is_active == True).to_list()  # noqa: E712
    expiring_ids = await expiring_product_ids()

    low_stock = 0
    out_of_stock = 0
    inventory_value = 0.0
    for product in products:
        inventory_value += product.stock * product.cost_price
        if product.stock == 0:
            out_of_stock += 1
        elif product.stock <= product.low_stock_threshold:
            low_stock += 1

    return InventoryStatsResponse(
        total_skus=len(products),
        low_stock=low_stock,
        out_of_stock=out_of_stock,
        expiring=len(expiring_ids),
        inventory_value=round(inventory_value, 2),
    )


@router.get("", response_model=PaginatedResponse[InventoryItemResponse])
async def list_inventory(
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=500),
    search: str = Query(""),
    stock_filter: str = Query("all", alias="filter", pattern="^(all|low|out|expiring)$"),
    supplier_id: str = Query(""),
    category: str = Query(""),
    _: User = Depends(get_current_user),
):
    query = Product.find(Product.is_active == True)  # noqa: E712
    if supplier_id:
        query = query.find({"supplier_id": supplier_id})
    if category:
        query = query.find({"category": category})
    if search:
        query = query.find({"$or": [
            {"name": {"$regex": search, "$options": "i"}},
            {"sku": {"$regex": search, "$options": "i"}},
        ]})

    if stock_filter == "low":
        query = query.find({"$expr": {
            "$and": [
                {"$gt": ["$stock", 0]},
                {"$lte": ["$stock", "$low_stock_threshold"]},
            ],
        }})
    elif stock_filter == "out":
        query = query.find(Product.stock == 0)
    elif stock_filter == "expiring":
        expiring_ids = await expiring_product_ids()
        if not expiring_ids:
            return PaginatedResponse(
                data=[], total=0, page=page, page_size=page_size, total_pages=1,
            )
        from beanie import PydanticObjectId
        query = query.find({"_id": {"$in": [PydanticObjectId(pid) for pid in expiring_ids]}})

    total = await query.count()
    products = await query.sort("name").skip((page - 1) * page_size).limit(page_size).to_list()

    items = []
    for product in products:
        batches = await get_sorted_batches(str(product.id))
        items.append(_item_response(product, batches))

    return PaginatedResponse(
        data=items,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=ceil(total / page_size) if total else 1,
    )


@router.post("/batches", response_model=BatchResponse, status_code=status.HTTP_201_CREATED)
async def receive_batch(
    body: BatchCreate,
    current_user: User = Depends(require_manager_or_above),
):
    """Receive a new stock batch (sets expiry date and quantity)."""
    batch = await receive_stock(
        body.product_id,
        body.batch_number,
        body.quantity,
        expiry_date=body.expiry_date,
    )
    return _batch_response(batch)


@router.post("/adjust", response_model=MessageResponse)
async def adjust_stock_endpoint(
    body: StockAdjustmentCreate,
    current_user: User = Depends(require_manager_or_above),
):
    new_stock = await adjust_stock(
        body.product_id,
        body.quantity,
        body.type,
        body.reason,
        current_user.name,
        batch_id=body.batch_id,
    )
    return MessageResponse(message=f"Stock adjusted. New stock: {new_stock}")
