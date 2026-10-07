import re

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from typing import Optional

from app.auth.dependencies import require_manager_or_above
from app.models.user import User
from app.services.reconciliation import (
    get_day_data,
    get_by_date,
    list_reconciliations,
    upsert_reconciliation,
    _to_response,
)

router = APIRouter(prefix="/reconciliations", tags=["Bank Reconciliation"])

_ISO_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def _validate_date(date: str) -> None:
    if not _ISO_DATE_RE.match(date):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="date must be YYYY-MM-DD")


class ReconciliationUpsertBody(BaseModel):
    date: str
    is_initial: bool = False
    previous_bank_balance: Optional[float] = Field(default=None, ge=0)
    previous_fone_pay_balance: Optional[float] = Field(default=None, ge=0)
    today_other_bank_in: float = Field(default=0.0, ge=0)
    today_bank_balance: float = Field(ge=0)
    today_fone_pay_balance: float = Field(ge=0)
    notes: Optional[str] = None


@router.get("")
async def list_all(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=100),
    start_date: Optional[str] = Query(default=None),
    end_date: Optional[str] = Query(default=None),
    _: User = Depends(require_manager_or_above),
):
    return await list_reconciliations(page, page_size, start_date, end_date)


@router.get("/{date}/day-data")
async def day_data(date: str, _: User = Depends(require_manager_or_above)):
    _validate_date(date)
    return await get_day_data(date)


@router.get("/{date}")
async def get_one(date: str, _: User = Depends(require_manager_or_above)):
    _validate_date(date)
    doc = await get_by_date(date)
    if not doc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Reconciliation not found")
    return _to_response(doc)


@router.post("", status_code=status.HTTP_201_CREATED)
async def create(
    body: ReconciliationUpsertBody,
    current_user: User = Depends(require_manager_or_above),
):
    _validate_date(body.date)
    doc = await upsert_reconciliation(
        date=body.date,
        is_initial=body.is_initial,
        previous_bank_balance=body.previous_bank_balance,
        previous_fone_pay_balance=body.previous_fone_pay_balance,
        today_other_bank_in=body.today_other_bank_in,
        today_bank_balance=body.today_bank_balance,
        today_fone_pay_balance=body.today_fone_pay_balance,
        notes=body.notes,
        created_by=current_user.name,
    )
    return _to_response(doc)


@router.put("/{date}")
async def update(
    date: str,
    body: ReconciliationUpsertBody,
    current_user: User = Depends(require_manager_or_above),
):
    _validate_date(date)
    doc = await upsert_reconciliation(
        date=date,
        is_initial=body.is_initial,
        previous_bank_balance=body.previous_bank_balance,
        previous_fone_pay_balance=body.previous_fone_pay_balance,
        today_other_bank_in=body.today_other_bank_in,
        today_bank_balance=body.today_bank_balance,
        today_fone_pay_balance=body.today_fone_pay_balance,
        notes=body.notes,
        created_by=current_user.name,
    )
    return _to_response(doc)
