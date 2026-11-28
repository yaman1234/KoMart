from fastapi import APIRouter, Depends, Query
from app.auth.dependencies import require_manager_or_above
from app.models.user import User
from app.services.reconciliation import get_daily_reconciliation

router = APIRouter(prefix="/reconciliation", tags=["Reconciliation"])


@router.get("/daily")
async def daily_reconciliation(
    month: str = Query(..., description="Month in YYYY-MM format, e.g. 2026-10"),
    _: User = Depends(require_manager_or_above),
):
    return await get_daily_reconciliation(month)
