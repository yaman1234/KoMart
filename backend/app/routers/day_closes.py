from datetime import datetime, timezone
import re

from fastapi import APIRouter, Depends, HTTPException, status, Request

from app.auth.dependencies import require_manager_or_above
from app.models.day_close import DayClose
from app.models.user import User
from app.models.audit_log import AuditModule
from app.schemas.reports import DayCloseUpsert, DayCloseBlock
from app.services.audit import log_audit

router = APIRouter(prefix="/day-closes", tags=["Day Closes"])

_ISO_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def _to_block(doc: DayClose) -> DayCloseBlock:
    return DayCloseBlock(
        date=doc.date,
        opening_cash=doc.opening_cash,
        closing_cash=doc.closing_cash,
        notes=doc.notes or "",
        updated_by=doc.updated_by or doc.created_by or "",
        updated_at=doc.updated_at.isoformat(),
    )


@router.put("/{day}", response_model=DayCloseBlock)
async def upsert_day_close(
    day: str,
    body: DayCloseUpsert,
    request: Request,
    current_user: User = Depends(require_manager_or_above),
):
    if not _ISO_DATE_RE.match(day):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="date must be YYYY-MM-DD")
    if body.opening_cash < 0 or body.closing_cash < 0:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Cash amounts cannot be negative")

    existing = await DayClose.find_one(DayClose.date == day)
    now = datetime.now(timezone.utc)
    if existing:
        before = {
            "date": existing.date,
            "opening_cash": existing.opening_cash,
            "closing_cash": existing.closing_cash,
        }
        await existing.set({
            "opening_cash": round(body.opening_cash, 2),
            "closing_cash": round(body.closing_cash, 2),
            "notes": (body.notes or "").strip(),
            "updated_by": current_user.name,
            "updated_at": now,
        })
        refreshed = await DayClose.find_one(DayClose.date == day)
        assert refreshed is not None
        await log_audit(
            module=AuditModule.sales,
            action="day_close_update",
            user=current_user,
            request=request,
            entity_type="day_close",
            entity_id=str(refreshed.id),
            previous=before,
            new={
                "date": refreshed.date,
                "opening_cash": refreshed.opening_cash,
                "closing_cash": refreshed.closing_cash,
            },
        )
        return _to_block(refreshed)

    doc = DayClose(
        date=day,
        opening_cash=round(body.opening_cash, 2),
        closing_cash=round(body.closing_cash, 2),
        notes=(body.notes or "").strip(),
        created_by=current_user.name,
        updated_by=current_user.name,
        created_at=now,
        updated_at=now,
    )
    await doc.insert()
    await log_audit(
        module=AuditModule.sales,
        action="day_close_create",
        user=current_user,
        request=request,
        entity_type="day_close",
        entity_id=str(doc.id),
        new={
            "date": doc.date,
            "opening_cash": doc.opening_cash,
            "closing_cash": doc.closing_cash,
        },
    )
    return _to_block(doc)


@router.get("/{day}", response_model=DayCloseBlock)
async def get_day_close(day: str, _: User = Depends(require_manager_or_above)):
    if not _ISO_DATE_RE.match(day):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="date must be YYYY-MM-DD")
    doc = await DayClose.find_one(DayClose.date == day)
    if not doc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Day close not found")
    return _to_block(doc)
