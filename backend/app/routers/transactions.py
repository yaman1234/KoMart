from fastapi import APIRouter, Depends, HTTPException, Query, status
from math import ceil
from datetime import datetime, timezone
from typing import Optional

from app.auth.dependencies import get_current_user
from app.models.user import User
from app.models.transaction import Transaction, PaymentMethod
from app.schemas.transaction import TransactionCreate, TransactionResponse
from app.schemas.common import PaginatedResponse
from app.services.sales import record_sale, _to_response

router = APIRouter(prefix="/transactions", tags=["Transactions"])


@router.get("", response_model=PaginatedResponse[TransactionResponse])
async def list_transactions(
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    search: str = Query(""),
    payment_method: Optional[PaymentMethod] = Query(None),
    start_date: str = Query(""),
    end_date: str = Query(""),
    _: User = Depends(get_current_user),
):
    filters: dict = {}
    if payment_method:
        filters["payment_method"] = payment_method
    if start_date:
        start = datetime.fromisoformat(start_date)
        if start.tzinfo is None:
            start = start.replace(tzinfo=timezone.utc)
        filters.setdefault("created_at", {})["$gte"] = start
    if end_date:
        end = datetime.fromisoformat(end_date)
        if end.tzinfo is None:
            end = end.replace(tzinfo=timezone.utc)
        end = end.replace(hour=23, minute=59, second=59)
        filters.setdefault("created_at", {})["$lte"] = end

    query = Transaction.find(filters) if filters else Transaction.find()

    if search:
        query = query.find({"$or": [
            {"transaction_number": {"$regex": search, "$options": "i"}},
            {"customer_name": {"$regex": search, "$options": "i"}},
        ]})

    total = await query.count()
    txns = await query.sort("-created_at").skip((page - 1) * page_size).limit(page_size).to_list()
    return PaginatedResponse(
        data=[_to_response(t) for t in txns],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=ceil(total / page_size) if total else 1,
    )


@router.get("/{txn_id}", response_model=TransactionResponse)
async def get_transaction(txn_id: str, _: User = Depends(get_current_user)):
    txn = await Transaction.get(txn_id)
    if not txn:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Transaction not found")
    return _to_response(txn)


@router.post("", response_model=TransactionResponse, status_code=status.HTTP_201_CREATED)
async def create_transaction(body: TransactionCreate, _: User = Depends(get_current_user)):
    return await record_sale(body)
