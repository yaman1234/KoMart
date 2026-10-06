from fastapi import APIRouter, Query
from app.services.reconciliation import get_daily_reconciliation

router = APIRouter(prefix="/reconciliation", tags=["Reconciliation"])


@router.get("/daily")
async def daily_reconciliation(
    month: str = Query(..., description="Month in YYYY-MM format, e.g. 2026-10"),
):
    return await get_daily_reconciliation(month)
