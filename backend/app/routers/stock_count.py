from math import ceil

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status

from app.auth.dependencies import get_current_user, require_manager_or_above
from app.models.audit_log import AuditModule
from app.models.stock_count import StockCount, StockCountStatus
from app.models.user import User, UserRole
from app.schemas.stock_count import (
    ApproveRequest,
    CountItemUpdate,
    RecountItemUpdate,
    StockCountCreateRequest,
    StockCountListItem,
    StockCountListResponse,
    StockCountResponse,
    VarianceReasonUpdate,
)
from app.services.audit import log_audit
from app.services.stock_count import (
    approve_count,
    bulk_record_count,
    cancel_count,
    create_stock_count,
    list_stock_counts,
    record_count,
    record_recount,
    request_recount,
    set_variance_reason,
    submit_count,
)

router = APIRouter(prefix="/stock-counts", tags=["Stock Counts"])


def _item_resp(item) -> dict:
    return {
        "product_id": item.product_id,
        "product_name": item.product_name,
        "sku": item.sku,
        "barcode": item.barcode,
        "category": item.category,
        "uom": item.uom,
        "image_url": item.image_url,
        "unit_cost": item.unit_cost,
        "snapshot_qty": item.snapshot_qty,
        "units_sold_in_window": item.units_sold_in_window,
        "adjusted_snapshot_qty": item.adjusted_snapshot_qty,
        "physical_qty": item.physical_qty,
        "recount_qty": item.recount_qty,
        "final_qty": item.final_qty,
        "variance_qty": item.variance_qty,
        "variance_value": item.variance_value,
        "reason": item.reason,
        "reason_note": item.reason_note,
        "counted_by": item.counted_by,
        "counted_at": item.counted_at.isoformat() if item.counted_at else None,
        "recounted_by": item.recounted_by,
        "recounted_at": item.recounted_at.isoformat() if item.recounted_at else None,
    }


def _sc_response(sc: StockCount, current_user: User | None = None) -> StockCountResponse:
    # In blind mode, hide snapshot_qty from non-managers
    is_manager = current_user and current_user.role in (UserRole.admin, UserRole.manager)
    items = []
    for item in sc.items:
        d = _item_resp(item)
        if sc.count_mode.value == "blind" and not is_manager and sc.status.value in ("counting", "recount_required"):
            d["snapshot_qty"] = -1  # sentinel: hidden
        items.append(d)

    return StockCountResponse(
        id=str(sc.id),
        count_number=sc.count_number,
        status=sc.status,
        count_type=sc.count_type,
        count_mode=sc.count_mode,
        category_filter=sc.category_filter,
        notes=sc.notes,
        items=items,
        audit_trail=[
            {
                "action": e.action,
                "user_name": e.user_name,
                "user_id": e.user_id,
                "timestamp": e.timestamp.isoformat(),
                "note": e.note,
            }
            for e in sc.audit_trail
        ],
        snapshot_taken_at=sc.snapshot_taken_at.isoformat() if sc.snapshot_taken_at else None,
        total_products=sc.total_products,
        counted_products=sc.counted_products,
        matched_count=sc.matched_count,
        short_count=sc.short_count,
        excess_count=sc.excess_count,
        shortage_value=sc.shortage_value,
        excess_value=sc.excess_value,
        net_variance_value=sc.net_variance_value,
        stock_accuracy_pct=sc.stock_accuracy_pct,
        created_by=sc.created_by,
        approved_by=sc.approved_by,
        adjustment_id=sc.adjustment_id,
        count_date=sc.count_date,
        created_at=sc.created_at.isoformat(),
        updated_at=sc.updated_at.isoformat(),
    )


def _list_item(sc: StockCount) -> StockCountListItem:
    return StockCountListItem(
        id=str(sc.id),
        count_number=sc.count_number,
        status=sc.status,
        count_type=sc.count_type,
        count_mode=sc.count_mode,
        category_filter=sc.category_filter,
        total_products=sc.total_products,
        counted_products=sc.counted_products,
        matched_count=sc.matched_count,
        short_count=sc.short_count,
        excess_count=sc.excess_count,
        net_variance_value=sc.net_variance_value,
        stock_accuracy_pct=sc.stock_accuracy_pct,
        created_by=sc.created_by,
        approved_by=sc.approved_by,
        adjustment_id=sc.adjustment_id,
        count_date=sc.count_date,
        created_at=sc.created_at.isoformat(),
    )


async def _get_sc(sc_id: str) -> StockCount:
    sc = await StockCount.get(sc_id)
    if not sc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Stock count not found.")
    return sc


# ── endpoints ─────────────────────────────────────────────────────────────────

@router.get("", response_model=StockCountListResponse)
async def list_counts(
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    status_filter: str = Query("", alias="status"),
    count_type: str = Query(""),
    search: str = Query(""),
    start_date: str = Query(""),
    end_date: str = Query(""),
    _: User = Depends(require_manager_or_above),
):
    rows, total = await list_stock_counts(
        page=page,
        page_size=page_size,
        status_filter=status_filter,
        count_type=count_type,
        search=search,
        start_date=start_date,
        end_date=end_date,
    )
    return StockCountListResponse(
        data=[_list_item(sc) for sc in rows],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=ceil(total / page_size) if total else 1,
    )


@router.post("", response_model=StockCountResponse, status_code=status.HTTP_201_CREATED)
async def create_count(
    body: StockCountCreateRequest,
    request: Request,
    current_user: User = Depends(require_manager_or_above),
):
    sc = await create_stock_count(
        count_type=body.count_type,
        count_mode=body.count_mode,
        category_filter=body.category_filter,
        product_ids=body.product_ids,
        notes=body.notes,
        count_date=body.count_date,
        user=current_user,
    )
    await log_audit(
        module=AuditModule.inventory,
        action="stock_count_created",
        user=current_user,
        request=request,
        entity_type="stock_count",
        entity_id=str(sc.id),
        new={"count_number": sc.count_number, "count_type": sc.count_type.value},
    )
    return _sc_response(sc, current_user)


@router.get("/{sc_id}", response_model=StockCountResponse)
async def get_count(
    sc_id: str,
    current_user: User = Depends(get_current_user),
):
    sc = await _get_sc(sc_id)
    return _sc_response(sc, current_user)


@router.post("/{sc_id}/count-item", response_model=StockCountResponse)
async def count_item(
    sc_id: str,
    body: CountItemUpdate,
    current_user: User = Depends(get_current_user),
):
    sc = await _get_sc(sc_id)
    sc = await record_count(sc, body.product_id, body.physical_qty, current_user)
    return _sc_response(sc, current_user)


@router.post("/{sc_id}/count-items", response_model=StockCountResponse)
async def count_items_bulk(
    sc_id: str,
    body: list[CountItemUpdate],
    current_user: User = Depends(get_current_user),
):
    sc = await _get_sc(sc_id)
    updates = [{"product_id": u.product_id, "physical_qty": u.physical_qty} for u in body]
    sc = await bulk_record_count(sc, updates, current_user)
    return _sc_response(sc, current_user)


@router.post("/{sc_id}/submit", response_model=StockCountResponse)
async def submit(
    sc_id: str,
    request: Request,
    current_user: User = Depends(get_current_user),
):
    sc = await _get_sc(sc_id)
    sc = await submit_count(sc, current_user)
    await log_audit(
        module=AuditModule.inventory,
        action="stock_count_submitted",
        user=current_user,
        request=request,
        entity_type="stock_count",
        entity_id=sc_id,
        new={"count_number": sc.count_number},
    )
    return _sc_response(sc, current_user)


@router.post("/{sc_id}/request-recount", response_model=StockCountResponse)
async def req_recount(
    sc_id: str,
    body: ApproveRequest,
    request: Request,
    current_user: User = Depends(require_manager_or_above),
):
    sc = await _get_sc(sc_id)
    sc = await request_recount(sc, current_user, body.notes)
    await log_audit(
        module=AuditModule.inventory,
        action="recount_requested",
        user=current_user,
        request=request,
        entity_type="stock_count",
        entity_id=sc_id,
    )
    return _sc_response(sc, current_user)


@router.post("/{sc_id}/recount-item", response_model=StockCountResponse)
async def recount_item(
    sc_id: str,
    body: RecountItemUpdate,
    current_user: User = Depends(get_current_user),
):
    sc = await _get_sc(sc_id)
    sc = await record_recount(sc, body.product_id, body.recount_qty, current_user)
    return _sc_response(sc, current_user)


@router.post("/{sc_id}/variance-reason", response_model=StockCountResponse)
async def variance_reason(
    sc_id: str,
    body: VarianceReasonUpdate,
    current_user: User = Depends(require_manager_or_above),
):
    sc = await _get_sc(sc_id)
    sc = await set_variance_reason(
        sc, body.product_id, body.reason, body.reason_note, body.final_qty, current_user
    )
    return _sc_response(sc, current_user)


@router.post("/{sc_id}/approve", response_model=StockCountResponse)
async def approve(
    sc_id: str,
    body: ApproveRequest,
    request: Request,
    current_user: User = Depends(require_manager_or_above),
):
    sc = await _get_sc(sc_id)
    sc = await approve_count(sc, current_user, body.notes)
    await log_audit(
        module=AuditModule.inventory,
        action="stock_count_approved",
        user=current_user,
        request=request,
        entity_type="stock_count",
        entity_id=sc_id,
        new={"count_number": sc.count_number, "net_variance": sc.net_variance_value},
    )
    return _sc_response(sc, current_user)


@router.post("/{sc_id}/cancel", response_model=StockCountResponse)
async def cancel(
    sc_id: str,
    body: ApproveRequest,
    request: Request,
    current_user: User = Depends(require_manager_or_above),
):
    sc = await _get_sc(sc_id)
    sc = await cancel_count(sc, current_user, body.notes)
    await log_audit(
        module=AuditModule.inventory,
        action="stock_count_cancelled",
        user=current_user,
        request=request,
        entity_type="stock_count",
        entity_id=sc_id,
    )
    return _sc_response(sc, current_user)
