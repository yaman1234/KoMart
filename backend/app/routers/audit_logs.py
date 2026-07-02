from datetime import datetime, timezone
from math import ceil

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.auth.dependencies import require_manager_or_above
from app.models.audit_log import AuditLog, AuditModule
from app.models.user import User
from app.schemas.audit_log import AuditLogResponse
from app.schemas.common import PaginatedResponse

router = APIRouter(prefix="/audit-logs", tags=["Audit Logs"])


def _to_response(entry: AuditLog) -> AuditLogResponse:
    return AuditLogResponse(
        id=str(entry.id),
        user_id=entry.user_id,
        user_name=entry.user_name,
        user_email=entry.user_email,
        module=entry.module,
        action=entry.action,
        entity_type=entry.entity_type,
        entity_id=entry.entity_id,
        previous_value=entry.previous_value,
        new_value=entry.new_value,
        ip_address=entry.ip_address,
        user_agent=entry.user_agent,
        browser=entry.browser,
        device=entry.device,
        request_id=entry.request_id,
        created_at=entry.created_at.isoformat(),
    )


@router.get("", response_model=PaginatedResponse[AuditLogResponse])
async def list_audit_logs(
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    module: str = Query(""),
    action: str = Query(""),
    user_id: str = Query(""),
    entity_type: str = Query(""),
    entity_id: str = Query(""),
    start_date: str = Query(""),
    end_date: str = Query(""),
    _: User = Depends(require_manager_or_above),
):
    query = AuditLog.find()

    if module:
        try:
            query = query.find(AuditLog.module == AuditModule(module))
        except ValueError:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Invalid module filter")
    if action:
        query = query.find(AuditLog.action == action)
    if user_id:
        query = query.find(AuditLog.user_id == user_id)
    if entity_type:
        query = query.find(AuditLog.entity_type == entity_type)
    if entity_id:
        query = query.find(AuditLog.entity_id == entity_id)

    date_filters: dict = {}
    if start_date:
        start = datetime.fromisoformat(start_date)
        if start.tzinfo is None:
            start = start.replace(tzinfo=timezone.utc)
        date_filters["$gte"] = start
    if end_date:
        end = datetime.fromisoformat(end_date)
        if end.tzinfo is None:
            end = end.replace(tzinfo=timezone.utc)
        end = end.replace(hour=23, minute=59, second=59)
        date_filters["$lte"] = end
    if date_filters:
        query = query.find({"created_at": date_filters})

    total = await query.count()
    rows = (
        await query.sort("-created_at")
        .skip((page - 1) * page_size)
        .limit(page_size)
        .to_list()
    )

    return PaginatedResponse(
        data=[_to_response(row) for row in rows],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=ceil(total / page_size) if total else 1,
    )


@router.get("/{log_id}", response_model=AuditLogResponse)
async def get_audit_log(log_id: str, _: User = Depends(require_manager_or_above)):
    entry = await AuditLog.get(log_id)
    if not entry:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Audit log not found")
    return _to_response(entry)
