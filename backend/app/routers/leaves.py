from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from typing import List, Optional
from datetime import datetime, timezone

from app.auth.dependencies import get_current_user, require_manager_or_above
from app.models.user import User, UserRole
from app.models.attendance import LeaveRequest, LeaveStatus, AttendanceRecord, AttendanceStatus
from app.models.audit_log import AuditModule
from app.services.audit import log_audit
from app.schemas.leave import LeaveCreate, LeaveReviewRequest, LeaveResponse

router = APIRouter(prefix="/leaves", tags=["Leaves"])


def _to_leave_response(l: LeaveRequest) -> LeaveResponse:
    return LeaveResponse(
        id=str(l.id),
        user_id=l.user_id,
        user_name=l.user_name,
        leave_type=l.leave_type,
        start_date=l.start_date,
        end_date=l.end_date,
        days_count=l.days_count,
        is_half_day=l.is_half_day,
        reason=l.reason,
        status=l.status,
        reviewed_by=l.reviewed_by,
        reviewed_by_name=l.reviewed_by_name,
        reviewed_at=l.reviewed_at,
        rejection_reason=l.rejection_reason,
        created_at=l.created_at,
    )


@router.get("", response_model=List[LeaveResponse])
async def list_leaves(
    status_filter: Optional[LeaveStatus] = Query(None, alias="status"),
    user_id: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
):
    """List leave requests. Cashiers only see their own; managers can view all or filter by user."""
    query = []
    if current_user.role == UserRole.cashier:
        query.append(LeaveRequest.user_id == str(current_user.id))
    elif user_id:
        query.append(LeaveRequest.user_id == user_id)

    if status_filter:
        query.append(LeaveRequest.status == status_filter)

    leaves = await LeaveRequest.find(*query).sort("-created_at").to_list()
    return [_to_leave_response(l) for l in leaves]


@router.post("", response_model=LeaveResponse, status_code=status.HTTP_201_CREATED)
async def request_leave(
    body: LeaveCreate,
    request: Request,
    current_user: User = Depends(get_current_user),
):
    """Submit a leave request."""
    if body.start_date > body.end_date:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Start date cannot be after end date",
        )

    overlap = await LeaveRequest.find_one(
        LeaveRequest.user_id == str(current_user.id),
        LeaveRequest.status != LeaveStatus.rejected,
        LeaveRequest.status != LeaveStatus.cancelled,
        LeaveRequest.start_date <= body.end_date,
        LeaveRequest.end_date >= body.start_date,
    )
    if overlap:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="You already have a pending or approved leave overlapping these dates",
        )

    from datetime import date as _date
    s_d = _date.fromisoformat(body.start_date)
    e_d = _date.fromisoformat(body.end_date)
    computed_days = 0.5 if body.is_half_day else float((e_d - s_d).days + 1)

    leave = LeaveRequest(
        user_id=str(current_user.id),
        user_name=current_user.name,
        leave_type=body.leave_type,
        start_date=body.start_date,
        end_date=body.end_date,
        days_count=computed_days,
        is_half_day=body.is_half_day,
        reason=body.reason,
        status=LeaveStatus.pending,
    )
    await leave.insert()

    await log_audit(
        module=AuditModule.attendance,
        action="request_leave",
        user=current_user,
        request=request,
        entity_type="leave_request",
        entity_id=str(leave.id),
        new={
            "leave_type": leave.leave_type.value,
            "start_date": leave.start_date,
            "end_date": leave.end_date,
            "days_count": leave.days_count,
        },
    )
    return _to_leave_response(leave)


@router.get("/{leave_id}", response_model=LeaveResponse)
async def get_leave(
    leave_id: str,
    current_user: User = Depends(get_current_user),
):
    """Get leave details."""
    leave = await LeaveRequest.get(leave_id)
    if not leave:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Leave request not found")

    if current_user.role == UserRole.cashier and leave.user_id != str(current_user.id):
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Access denied")

    return _to_leave_response(leave)


@router.patch("/{leave_id}/review", response_model=LeaveResponse)
async def review_leave(
    leave_id: str,
    body: LeaveReviewRequest,
    request: Request,
    manager: User = Depends(require_manager_or_above),
):
    """Approve or reject a pending leave request."""
    leave = await LeaveRequest.get(leave_id)
    if not leave:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Leave request not found")

    if leave.status != LeaveStatus.pending:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Leave request is already {leave.status.value}",
        )

    now_utc = datetime.now(timezone.utc)
    decision = body.decision.lower()
    if decision not in ("approved", "rejected"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Decision must be 'approved' or 'rejected'",
        )

    leave.status = LeaveStatus.approved if decision == "approved" else LeaveStatus.rejected
    leave.reviewed_by = str(manager.id)
    leave.reviewed_by_name = manager.name
    leave.reviewed_at = now_utc
    if decision == "rejected":
        leave.rejection_reason = body.rejection_reason
    leave.updated_at = now_utc
    await leave.save()

    # If approved, update any existing unpunched attendance records in date range to on_leave
    if leave.status == LeaveStatus.approved:
        records = await AttendanceRecord.find(
            AttendanceRecord.user_id == leave.user_id,
            AttendanceRecord.date >= leave.start_date,
            AttendanceRecord.date <= leave.end_date,
        ).to_list()
        for r in records:
            if not r.clock_in:
                r.status = AttendanceStatus.on_leave
                r.updated_at = now_utc
                await r.save()

    await log_audit(
        module=AuditModule.attendance,
        action="review_leave",
        user=manager,
        request=request,
        entity_type="leave_request",
        entity_id=str(leave.id),
        new={
            "decision": leave.status.value,
            "reviewed_by": manager.name,
            "rejection_reason": leave.rejection_reason,
        },
    )
    return _to_leave_response(leave)


@router.delete("/{leave_id}", status_code=status.HTTP_200_OK)
async def cancel_leave(
    leave_id: str,
    request: Request,
    current_user: User = Depends(get_current_user),
):
    """Cancel a pending leave request."""
    leave = await LeaveRequest.get(leave_id)
    if not leave:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Leave request not found")

    if current_user.role == UserRole.cashier and leave.user_id != str(current_user.id):
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Access denied")

    if leave.status != LeaveStatus.pending:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only pending leave requests can be cancelled",
        )

    leave.status = LeaveStatus.cancelled
    leave.updated_at = datetime.now(timezone.utc)
    await leave.save()

    await log_audit(
        module=AuditModule.attendance,
        action="cancel_leave",
        user=current_user,
        request=request,
        entity_type="leave_request",
        entity_id=str(leave.id),
        new={"status": "cancelled"},
    )
    return {"message": "Leave request cancelled successfully"}
