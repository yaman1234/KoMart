from fastapi import APIRouter, HTTPException, status, Depends, Query
from math import ceil
from datetime import datetime, timezone

from app.auth.dependencies import get_current_user, require_manager_or_above
from app.models.user import User
from app.models.expense import Expense
from app.schemas.expense import ExpenseCreate, ExpenseUpdate, ExpenseResponse
from app.schemas.common import PaginatedResponse

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


@router.post("", response_model=ExpenseResponse, status_code=status.HTTP_201_CREATED)
async def create_expense(body: ExpenseCreate, _: User = Depends(require_manager_or_above)):
    expense = Expense(**body.model_dump())
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
