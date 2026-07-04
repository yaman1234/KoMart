from fastapi import APIRouter, HTTPException, status, Depends, Query
from math import ceil
from datetime import datetime, timezone, date
import calendar

from app.auth.dependencies import get_current_user, require_manager_or_above
from app.models.user import User
from app.models.expense import Expense
from app.schemas.expense import ExpenseCreate, ExpenseUpdate, ExpenseResponse, ExpenseStatsResponse
from app.schemas.common import PaginatedResponse
from app.services.expense_helpers import SETUP_INVESTMENT_MATCH, normalize_setup_fields

router = APIRouter(prefix="/expenses", tags=["Expenses"])


def _to_response(e: Expense) -> ExpenseResponse:
    return ExpenseResponse(
        id=str(e.id),
        title=e.title,
        description=e.description,
        amount=e.amount,
        category=e.category,
        date=e.date,
        paid_to=e.paid_to,
        payment_method=e.payment_method,
        is_setup_cost=e.is_setup_cost,
        created_at=e.created_at.isoformat(),
        updated_at=e.updated_at.isoformat(),
    )


@router.get("", response_model=PaginatedResponse[ExpenseResponse])
async def list_expenses(
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=2000),
    search: str = Query(""),
    category: str = Query(""),
    is_setup_cost: str = Query(""),  # "true" | "false" | "" (all)
    _: User = Depends(get_current_user),
):
    query = Expense.find()

    if search:
        query = query.find({"title": {"$regex": search, "$options": "i"}})

    if category:
        query = query.find({"category": category})

    if is_setup_cost in ("true", "false"):
        query = query.find({"is_setup_cost": is_setup_cost == "true"})

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
async def expense_stats(_: User = Depends(get_current_user)):
    """Aggregate totals for the expenses page stat cards."""
    today = date.today()
    month_start = today.replace(day=1).isoformat()
    _, last_day = calendar.monthrange(today.year, today.month)
    month_end = date(today.year, today.month, last_day).isoformat()

    col = Expense.get_motor_collection()

    totals_rows = await col.aggregate([
        {
            "$group": {
                "_id": None,
                "total_expenses": {"$sum": "$amount"},
                "setup_investment": {
                    "$sum": {"$cond": [SETUP_INVESTMENT_MATCH, "$amount", 0]},
                },
            },
        },
    ]).to_list(1)

    month_rows = await col.aggregate([
        {"$match": {"date": {"$gte": month_start, "$lte": month_end}}},
        {"$group": {"_id": None, "this_month": {"$sum": "$amount"}}},
    ]).to_list(1)

    totals = totals_rows[0] if totals_rows else {}
    month = month_rows[0] if month_rows else {}

    return ExpenseStatsResponse(
        total_expenses=round(float(totals.get("total_expenses", 0) or 0), 2),
        this_month=round(float(month.get("this_month", 0) or 0), 2),
        setup_investment=round(float(totals.get("setup_investment", 0) or 0), 2),
    )


@router.post("", response_model=ExpenseResponse, status_code=status.HTTP_201_CREATED)
async def create_expense(body: ExpenseCreate, _: User = Depends(require_manager_or_above)):
    data = normalize_setup_fields(body.model_dump())
    expense = Expense(**data)
    await expense.insert()
    return _to_response(expense)


@router.get("/{expense_id}", response_model=ExpenseResponse)
async def get_expense(expense_id: str, _: User = Depends(get_current_user)):
    expense = await Expense.get(expense_id)
    if not expense:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Expense not found")
    return _to_response(expense)


@router.patch("/{expense_id}", response_model=ExpenseResponse)
async def update_expense(
    expense_id: str, body: ExpenseUpdate, _: User = Depends(require_manager_or_above)
):
    expense = await Expense.get(expense_id)
    if not expense:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Expense not found")

    update_data = {k: v for k, v in body.model_dump().items() if v is not None}
    normalized = normalize_setup_fields({
        "category": update_data.get("category", expense.category),
        "is_setup_cost": update_data.get("is_setup_cost", expense.is_setup_cost),
    })
    if normalized.get("is_setup_cost") and not update_data.get("is_setup_cost"):
        update_data["is_setup_cost"] = True
    update_data["updated_at"] = datetime.now(timezone.utc)

    if update_data:
        await expense.set(update_data)

    return _to_response(expense)


@router.delete("/{expense_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_expense(expense_id: str, _: User = Depends(require_manager_or_above)):
    expense = await Expense.get(expense_id)
    if not expense:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Expense not found")
    await expense.delete()
