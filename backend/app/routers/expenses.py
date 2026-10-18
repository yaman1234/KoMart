from fastapi import APIRouter, HTTPException, status, Depends, Query, Request
from math import ceil
from datetime import datetime, timezone, date
import calendar
import re
from bson import ObjectId as BsonObjectId

from app.auth.dependencies import get_current_user, require_manager_or_above
from app.models.user import User
from app.models.expense import Expense, ExpenseCategory
from app.models.product import Product
from app.models.inventory import AdjustmentType, InventoryBatch, StockAdjustment
from app.schemas.expense import (
    ExpenseCreate,
    ExpenseUpdate,
    ExpenseResponse,
    ExpenseStatsResponse,
    ProductConsumptionCreate,
)
from app.schemas.common import PaginatedResponse
from app.services.expense_helpers import (
    SETUP_INVESTMENT_MATCH,
    assert_valid_expense_category,
    normalize_setup_fields,
)
from app.models.audit_log import AuditModule
from app.services.audit import log_audit, expense_snapshot
from app.services.po_payment import reverse_payment_for_expense
from app.services.stock import (
    BatchDeduction,
    SignedBatchMove,
    check_stock_available,
    deduct_stock_fefo,
    get_current_stock,
    log_signed_batch_moves,
    record_inventory_change,
    restock_from_deductions,
)

router = APIRouter(prefix="/expenses", tags=["Expenses"])


def _to_response(e: Expense) -> ExpenseResponse:
    return ExpenseResponse(
        id=str(e.id),
        title=e.title,
        description=e.description,
        amount=e.amount,
        category=str(e.category),
        date=e.date,
        paid_to=e.paid_to,
        bill_no=getattr(e, "bill_no", None),
        payment_method=e.payment_method,
        is_setup_cost=e.is_setup_cost,
        purchase_order_id=getattr(e, "purchase_order_id", None),
        items=getattr(e, "items", None),
        created_at=e.created_at.isoformat(),
        updated_at=e.updated_at.isoformat(),
    )


def _build_expense_filter(
    search: str = "",
    category: str = "",
    is_setup_cost: str = "",
    start_date: str = "",
    end_date: str = "",
    payment_method: str = "",
) -> dict:
    match: dict = {}
    if search:
        escaped = re.escape(search.strip())
        match["$or"] = [
            {"title": {"$regex": escaped, "$options": "i"}},
            {"bill_no": {"$regex": escaped, "$options": "i"}},
            {"paid_to": {"$regex": escaped, "$options": "i"}},
            {"description": {"$regex": escaped, "$options": "i"}},
            {"items.productName": {"$regex": escaped, "$options": "i"}},
            {"items.product_name": {"$regex": escaped, "$options": "i"}},
            {"items.sku": {"$regex": escaped, "$options": "i"}},
        ]
    if category:
        match["category"] = category
    if is_setup_cost in ("true", "false"):
        match["is_setup_cost"] = is_setup_cost == "true"
    if start_date or end_date:
        date_cond: dict = {}
        if start_date:
            date_cond["$gte"] = start_date
        if end_date:
            date_cond["$lte"] = end_date
        match["date"] = date_cond
    if payment_method:
        aliases = [payment_method]
        if payment_method == "bank":
            aliases.append("card")
        if payment_method == "esewa":
            aliases.append("khalti")
        match["payment_method"] = {"$in": aliases}
    return match


@router.get("", response_model=PaginatedResponse[ExpenseResponse])
async def list_expenses(
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=2000),
    search: str = Query(""),
    category: str = Query(""),
    is_setup_cost: str = Query(""),  # "true" | "false" | "" (all)
    start_date: str = Query(""),
    end_date: str = Query(""),
    payment_method: str = Query(""),
    _: User = Depends(get_current_user),
):
    match_filter = _build_expense_filter(
        search=search,
        category=category,
        is_setup_cost=is_setup_cost,
        start_date=start_date,
        end_date=end_date,
        payment_method=payment_method,
    )
    query = Expense.find(match_filter) if match_filter else Expense.find()

    # Sort newest-date first
    query = query.sort([("date", -1), ("created_at", -1)])

    total = await query.count()
    expenses = await query.skip((page - 1) * page_size).limit(page_size).to_list()

    return PaginatedResponse(
        data=[_to_response(e) for e in expenses],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=ceil(total / page_size) if total else 1,
    )


@router.get("/summary", response_model=ExpenseStatsResponse)
async def expense_stats(
    search: str = Query(""),
    category: str = Query(""),
    is_setup_cost: str = Query(""),
    start_date: str = Query(""),
    end_date: str = Query(""),
    payment_method: str = Query(""),
    _: User = Depends(get_current_user),
):
    """Aggregate totals for the expenses page stat cards based on active filters."""
    col = Expense.get_motor_collection()

    match_filter = _build_expense_filter(
        search=search,
        category=category,
        is_setup_cost=is_setup_cost,
        start_date=start_date,
        end_date=end_date,
        payment_method=payment_method,
    )

    pipeline: list[dict] = []
    if match_filter:
        pipeline.append({"$match": match_filter})
    pipeline.append({
        "$group": {
            "_id": None,
            "total_expenses": {"$sum": "$amount"},
            "setup_investment": {
                "$sum": {"$cond": [SETUP_INVESTMENT_MATCH, "$amount", 0]},
            },
            "inventory_consumption": {
                "$sum": {"$cond": [{"$eq": ["$payment_method", "inventory"]}, "$amount", 0]},
            },
            "cash_outflow": {
                "$sum": {"$cond": [{"$ne": ["$payment_method", "inventory"]}, "$amount", 0]},
            },
            "total_po_paid": {
                "$sum": {
                    "$cond": [
                        {
                            "$or": [
                                {"$eq": ["$category", "purchase_order"]},
                                {
                                    "$and": [
                                        {"$ne": ["$purchase_order_id", None]},
                                        {"$ne": ["$purchase_order_id", ""]},
                                    ]
                                },
                            ]
                        },
                        "$amount",
                        0,
                    ]
                },
            },
            "expense_count": {"$sum": 1},
        },
    })

    totals_rows = await col.aggregate(pipeline).to_list(1)

    today = date.today()
    month_start = today.replace(day=1).isoformat()
    _, last_day = calendar.monthrange(today.year, today.month)
    month_end = date(today.year, today.month, last_day).isoformat()

    month_filter = _build_expense_filter(
        search=search,
        category=category,
        is_setup_cost=is_setup_cost,
        start_date=month_start,
        end_date=month_end,
        payment_method=payment_method,
    )
    month_pipeline: list[dict] = []
    if month_filter:
        month_pipeline.append({"$match": month_filter})
    month_pipeline.append({
        "$group": {
            "_id": None,
            "this_month": {"$sum": "$amount"},
        },
    })
    month_rows = await col.aggregate(month_pipeline).to_list(1)

    totals = totals_rows[0] if totals_rows else {}
    month = month_rows[0] if month_rows else {}
    total_expenses = round(float(totals.get("total_expenses", 0) or 0), 2)
    setup_investment = round(float(totals.get("setup_investment", 0) or 0), 2)
    inventory_consumption = round(float(totals.get("inventory_consumption", 0) or 0), 2)
    cash_outflow = round(float(totals.get("cash_outflow", 0) or 0), 2)
    total_po_paid = round(float(totals.get("total_po_paid", 0) or 0), 2)
    this_month = round(float(month.get("this_month", 0) or 0), 2)
    expense_count = int(totals.get("expense_count", 0) or 0)

    return ExpenseStatsResponse(
        total_expenses=total_expenses,
        this_month=this_month,
        setup_investment=setup_investment,
        operating_expenses=round(total_expenses - setup_investment, 2),
        cash_outflow=cash_outflow,
        inventory_consumption=inventory_consumption,
        total_po_paid=total_po_paid,
        expense_count=expense_count,
    )


@router.post("/product-consumption", response_model=ExpenseResponse, status_code=status.HTTP_201_CREATED)
async def create_product_consumption(
    body: ProductConsumptionCreate,
    request: Request,
    current_user: User = Depends(require_manager_or_above),
):
    """Record internal staff/store consumption of products as non-cash inventory expenses."""
    await assert_valid_expense_category(str(body.category or ""))

    # 1. Load and pre-validate all products and requested quantities
    product_map: dict[str, Product] = {}
    for item in body.items:
        p = await Product.get(item.product_id)
        if not p:
            raise HTTPException(
                status.HTTP_404_NOT_FOUND,
                detail=f"Product not found: {item.product_id}",
            )
        product_map[item.product_id] = p
        await check_stock_available(item.product_id, item.quantity)

    # 2. Perform FEFO stock deduction and calculate actual batch unit cost
    all_deductions_per_item: list[tuple[ProductConsumptionItemRequest, list[BatchDeduction]]] = []
    stock_before_map: dict[str, int] = {}
    item_summaries: list[dict] = []
    total_expense_amount = 0.0

    try:
        for item in body.items:
            product = product_map[item.product_id]
            stock_before = await get_current_stock(item.product_id)
            stock_before_map[item.product_id] = stock_before

            deductions = await deduct_stock_fefo(item.product_id, item.quantity)
            all_deductions_per_item.append((item, deductions))

            line_cost = sum(d.quantity * d.unit_cost for d in deductions)
            total_expense_amount += line_cost
            item_summaries.append({
                "productId": str(product.id),
                "productName": product.name,
                "sku": product.sku,
                "quantity": item.quantity,
                "unitCost": round(line_cost / item.quantity, 2) if item.quantity else product.cost_price,
                "totalCost": round(line_cost, 2),
            })
    except Exception:
        # Roll back any batch allocations if an error occurs
        for _, deductions in all_deductions_per_item:
            await restock_from_deductions(deductions)
        raise

    # 3. Create the non-cash Expense document
    names_str = ", ".join(s["productName"] for s in item_summaries[:2])
    if len(item_summaries) > 2:
        names_str += f" +{len(item_summaries) - 2} more"
    title = f"Staff Consumption: {names_str}"

    expense = Expense(
        title=title,
        description=body.remarks or f"Internal consumption by {body.staff_name}",
        amount=round(total_expense_amount, 2),
        category=body.category,
        date=body.date,
        paid_to=body.staff_name,
        bill_no=body.bill_no or f"USE-{datetime.now(timezone.utc).strftime('%y%m%d%H%M')}",
        payment_method="inventory",
        is_setup_cost=False,
        items=item_summaries,
    )
    await expense.insert()

    # 4. Log the inventory ledger adjustments linked to this expense
    for item, deductions in all_deductions_per_item:
        product = product_map[item.product_id]
        stock_before = stock_before_map[item.product_id]
        moves = [
            SignedBatchMove(
                batch_id=d.batch_id,
                quantity=-d.quantity,
                unit_cost=d.unit_cost,
            )
            for d in deductions
        ]
        await log_signed_batch_moves(
            product=product,
            moves=moves,
            stock_before=stock_before,
            adjustment_type=AdjustmentType.internal_use,
            reason=f"Staff consumption: {body.remarks or 'Store use'} (Staff: {body.staff_name})",
            created_by=current_user.name,
            reference_type="expense",
            reference_id=str(expense.id),
            category=body.category,
        )

    from app.services.response_cache import bump_commerce_caches
    await bump_commerce_caches()

    await log_audit(
        module=AuditModule.expenses,
        action="create",
        user=current_user,
        request=request,
        entity_type="expense",
        entity_id=str(expense.id),
        new=expense_snapshot(expense),
    )
    return _to_response(expense)


@router.post("", response_model=ExpenseResponse, status_code=status.HTTP_201_CREATED)
async def create_expense(
    body: ExpenseCreate,
    request: Request,
    current_user: User = Depends(require_manager_or_above),
):
    data = normalize_setup_fields(body.model_dump())
    await assert_valid_expense_category(str(data.get("category") or ""))
    if data.get("category") == ExpenseCategory.purchase_order.value and not data.get("purchase_order_id"):
        # Manual PO-category expenses are allowed without a link; system payments set the id.
        pass
    expense = Expense(**data)
    await expense.insert()
    from app.services.wallet_ledger import post_expense
    await post_expense(expense, created_by=current_user.name)
    await log_audit(
        module=AuditModule.expenses,
        action="create",
        user=current_user,
        request=request,
        entity_type="expense",
        entity_id=str(expense.id),
        new=expense_snapshot(expense),
    )
    return _to_response(expense)


@router.get("/{expense_id}", response_model=ExpenseResponse)
async def get_expense(expense_id: str, _: User = Depends(get_current_user)):
    expense = await Expense.get(expense_id)
    if not expense:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Expense not found")
    return _to_response(expense)


@router.patch("/{expense_id}", response_model=ExpenseResponse)
async def update_expense(
    expense_id: str,
    body: ExpenseUpdate,
    request: Request,
    current_user: User = Depends(require_manager_or_above),
):
    expense = await Expense.get(expense_id)
    if not expense:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Expense not found")

    if getattr(expense, "purchase_order_id", None):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail="PO-linked expenses cannot be edited here. Delete to reverse the payment, or record a new payment on the purchase order.",
        )

    if getattr(expense, "payment_method", None) == "inventory":
        dumped = body.model_dump(exclude_unset=True)
        if "amount" in dumped and dumped["amount"] != expense.amount:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                detail="Store consumption expense amounts cannot be manually edited because they are tied to inventory batch costs. Delete to reverse stock, or record a new entry.",
            )
        if "payment_method" in dumped and dumped["payment_method"] != "inventory":
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                detail="Store consumption payment method cannot be changed from inventory.",
            )

    before = expense_snapshot(expense)
    update_data = {k: v for k, v in body.model_dump().items() if v is not None}
    if "category" in update_data:
        await assert_valid_expense_category(
            str(update_data["category"]),
            allow_inactive=True,
        )
    normalized = normalize_setup_fields({
        "category": update_data.get("category", expense.category),
        "is_setup_cost": update_data.get("is_setup_cost", expense.is_setup_cost),
    })
    if normalized.get("is_setup_cost") and not update_data.get("is_setup_cost"):
        update_data["is_setup_cost"] = True
    update_data["updated_at"] = datetime.now(timezone.utc)

    if update_data:
        await expense.set(update_data)

    refreshed = await Expense.get(expense_id)
    # Re-post wallet movement when payment wallet or amount changes
    money_keys = {"amount", "payment_method", "date", "category", "title"}
    if money_keys & set(update_data.keys()):
        from app.services.wallet_ledger import delete_reference, post_expense
        await delete_reference("expense", expense_id)
        if refreshed:
            await post_expense(refreshed, created_by=current_user.name)

    await log_audit(
        module=AuditModule.expenses,
        action="update",
        user=current_user,
        request=request,
        entity_type="expense",
        entity_id=expense_id,
        previous=before,
        new=expense_snapshot(refreshed),  # type: ignore[arg-type]
    )
    return _to_response(refreshed)  # type: ignore[arg-type]


@router.delete("/{expense_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_expense(
    expense_id: str,
    request: Request,
    current_user: User = Depends(require_manager_or_above),
):
    expense = await Expense.get(expense_id)
    if not expense:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Expense not found")

    before = expense_snapshot(expense)
    await reverse_payment_for_expense(expense, current_user=current_user, request=request)

    # If this was an inventory/store consumption expense, restore deducted stock back to batches
    if getattr(expense, "payment_method", None) == "inventory":
        adjustments = await StockAdjustment.find(
            StockAdjustment.reference_type == "expense",
            StockAdjustment.reference_id == expense_id,
        ).to_list()
        for adj in adjustments:
            if adj.batch_id and adj.quantity < 0:
                restore_qty = abs(adj.quantity)
                col = InventoryBatch.get_motor_collection()
                await col.update_one(
                    {"_id": BsonObjectId(adj.batch_id)},
                    {"$inc": {"quantity": restore_qty}},
                )
                product = await Product.get(adj.product_id)
                if product:
                    stock_before = await get_current_stock(adj.product_id) - restore_qty
                    stock_after = await get_current_stock(adj.product_id)
                    await record_inventory_change(
                        product=product,
                        quantity=restore_qty,
                        adjustment_type=AdjustmentType.adjustment,
                        reason=f"Restock from deleted staff consumption expense #{expense_id}",
                        created_by=current_user.name,
                        stock_before=stock_before,
                        stock_after=stock_after,
                        batch_id=adj.batch_id,
                        reference_type="expense_reversal",
                        reference_id=expense_id,
                        unit_cost=adj.unit_cost,
                    )
        from app.services.response_cache import bump_commerce_caches
        await bump_commerce_caches()

    from app.services.wallet_ledger import reverse_reference
    await reverse_reference(
        reference_type="expense",
        reference_id=expense_id,
        reason="Expense deleted",
        created_by=current_user.name,
    )
    await expense.delete()
    await log_audit(
        module=AuditModule.expenses,
        action="delete",
        user=current_user,
        request=request,
        entity_type="expense",
        entity_id=expense_id,
        previous=before,
    )
