from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from typing import List, Optional
from datetime import datetime, timezone

from app.auth.dependencies import get_current_user, require_manager_or_above, require_admin_only
from app.models.user import User
from app.models.attendance import Shift, ShiftAssignment
from app.models.audit_log import AuditModule
from app.services.audit import log_audit
from app.schemas.shift import (
    ShiftCreate,
    ShiftUpdate,
    ShiftResponse,
    ShiftAssignmentCreate,
    ShiftAssignmentUpdate,
    ShiftAssignmentResponse,
)

router = APIRouter(prefix="/shifts", tags=["Shifts"])


def _to_shift_response(s: Shift) -> ShiftResponse:
    return ShiftResponse(
        id=str(s.id),
        name=s.name,
        code=s.code,
        start_time=s.start_time,
        end_time=s.end_time,
        grace_period_minutes=s.grace_period_minutes,
        half_day_threshold_minutes=s.half_day_threshold_minutes,
        full_day_threshold_minutes=s.full_day_threshold_minutes,
        break_allowance_minutes=s.break_allowance_minutes,
        color_code=s.color_code,
        days_of_week=s.days_of_week,
        is_active=s.is_active,
        created_at=s.created_at,
        updated_at=s.updated_at,
    )


def _to_assignment_response(a: ShiftAssignment) -> ShiftAssignmentResponse:
    return ShiftAssignmentResponse(
        id=str(a.id),
        user_id=a.user_id,
        user_name=a.user_name,
        shift_id=a.shift_id,
        shift_name=a.shift_name,
        effective_from=a.effective_from,
        effective_to=a.effective_to,
        assigned_by=a.assigned_by,
        created_at=a.created_at,
    )


@router.get("", response_model=List[ShiftResponse])
async def list_shifts(
    include_inactive: bool = Query(False),
    _: User = Depends(get_current_user),
):
    """List store shifts."""
    query = {} if include_inactive else {"is_active": True}
    shifts = await Shift.find(query).sort("start_time").to_list()
    return [_to_shift_response(s) for s in shifts]


@router.post("", response_model=ShiftResponse, status_code=status.HTTP_201_CREATED)
async def create_shift(
    body: ShiftCreate,
    request: Request,
    manager: User = Depends(require_manager_or_above),
):
    """Create a new shift definition."""
    existing = await Shift.find_one(Shift.code == body.code.upper())
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Shift with code '{body.code}' already exists",
        )

    shift = Shift(
        name=body.name,
        code=body.code.upper(),
        start_time=body.start_time,
        end_time=body.end_time,
        grace_period_minutes=body.grace_period_minutes,
        half_day_threshold_minutes=body.half_day_threshold_minutes,
        full_day_threshold_minutes=body.full_day_threshold_minutes,
        break_allowance_minutes=body.break_allowance_minutes,
        color_code=body.color_code,
        days_of_week=body.days_of_week,
        is_active=body.is_active,
    )
    await shift.insert()

    await log_audit(
        module=AuditModule.attendance,
        action="create_shift",
        user=manager,
        request=request,
        entity_type="shift",
        entity_id=str(shift.id),
        new={"code": shift.code, "name": shift.name, "start_time": shift.start_time, "end_time": shift.end_time},
    )
    return _to_shift_response(shift)


@router.get("/assignments", response_model=List[ShiftAssignmentResponse])
async def list_shift_assignments(
    user_id: Optional[str] = Query(None),
    _: User = Depends(require_manager_or_above),
):
    """List staff shift assignments."""
    query = [ShiftAssignment.user_id == user_id] if user_id else []
    assignments = await ShiftAssignment.find(*query).sort("-effective_from").to_list()
    return [_to_assignment_response(a) for a in assignments]


@router.post("/assignments", response_model=ShiftAssignmentResponse, status_code=status.HTTP_201_CREATED)
async def assign_shift(
    body: ShiftAssignmentCreate,
    request: Request,
    manager: User = Depends(require_manager_or_above),
):
    """Assign an employee to a shift."""
    target_user = await User.get(body.user_id)
    if not target_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    shift = await Shift.get(body.shift_id)
    if not shift or not shift.is_active:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Shift not found or inactive",
        )

    assignment = ShiftAssignment(
        user_id=str(target_user.id),
        user_name=target_user.name,
        shift_id=str(shift.id),
        shift_name=shift.name,
        effective_from=body.effective_from,
        effective_to=body.effective_to,
        assigned_by=manager.name,
    )
    await assignment.insert()

    await log_audit(
        module=AuditModule.attendance,
        action="assign_shift",
        user=manager,
        request=request,
        entity_type="shift_assignment",
        entity_id=str(assignment.id),
        new={
            "user_id": str(target_user.id),
            "user_name": target_user.name,
            "shift_id": str(shift.id),
            "shift_name": shift.name,
            "effective_from": body.effective_from,
        },
    )
    return _to_assignment_response(assignment)


@router.patch("/assignments/{assignment_id}", response_model=ShiftAssignmentResponse)
async def update_shift_assignment(
    assignment_id: str,
    body: ShiftAssignmentUpdate,
    request: Request,
    manager: User = Depends(require_manager_or_above),
):
    """Update a staff shift assignment."""
    assignment = await ShiftAssignment.get(assignment_id)
    if not assignment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Shift assignment not found",
        )

    prev_snapshot = {
        "shift_id": assignment.shift_id,
        "shift_name": assignment.shift_name,
        "effective_from": assignment.effective_from,
        "effective_to": assignment.effective_to,
    }

    if body.shift_id is not None and body.shift_id != assignment.shift_id:
        shift = await Shift.get(body.shift_id)
        if not shift or not shift.is_active:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Target shift not found or inactive",
            )
        assignment.shift_id = str(shift.id)
        assignment.shift_name = shift.name

    if body.effective_from is not None:
        assignment.effective_from = body.effective_from
    if body.effective_to is not None:
        assignment.effective_to = body.effective_to

    await assignment.save()

    await log_audit(
        module=AuditModule.attendance,
        action="update_shift_assignment",
        user=manager,
        request=request,
        entity_type="shift_assignment",
        entity_id=str(assignment.id),
        previous=prev_snapshot,
        new={
            "shift_id": assignment.shift_id,
            "shift_name": assignment.shift_name,
            "effective_from": assignment.effective_from,
            "effective_to": assignment.effective_to,
        },
    )
    return _to_assignment_response(assignment)


@router.delete("/assignments/{assignment_id}", status_code=status.HTTP_200_OK)
async def delete_shift_assignment(
    assignment_id: str,
    request: Request,
    manager: User = Depends(require_manager_or_above),
):
    """Delete a staff shift assignment."""
    assignment = await ShiftAssignment.get(assignment_id)
    if not assignment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Shift assignment not found",
        )

    await assignment.delete()

    await log_audit(
        module=AuditModule.attendance,
        action="delete_shift_assignment",
        user=manager,
        request=request,
        entity_type="shift_assignment",
        entity_id=assignment_id,
        previous={
            "user_id": assignment.user_id,
            "user_name": assignment.user_name,
            "shift_name": assignment.shift_name,
        },
        new={"action": "deleted"},
    )
    return {"message": "Shift assignment deleted successfully"}


@router.get("/{shift_id}", response_model=ShiftResponse)
async def get_shift(
    shift_id: str,
    _: User = Depends(get_current_user),
):
    """Get shift details."""
    shift = await Shift.get(shift_id)
    if not shift:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Shift not found")
    return _to_shift_response(shift)


@router.patch("/{shift_id}", response_model=ShiftResponse)
async def update_shift(
    shift_id: str,
    body: ShiftUpdate,
    request: Request,
    manager: User = Depends(require_manager_or_above),
):
    """Update a shift definition."""
    shift = await Shift.get(shift_id)
    if not shift:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Shift not found")

    update_dict = body.model_dump(exclude_unset=True)
    if not update_dict:
        return _to_shift_response(shift)

    prev_snapshot = {"name": shift.name, "start_time": shift.start_time, "end_time": shift.end_time}
    for field, val in update_dict.items():
        setattr(shift, field, val)
    shift.updated_at = datetime.now(timezone.utc)
    await shift.save()

    await log_audit(
        module=AuditModule.attendance,
        action="update_shift",
        user=manager,
        request=request,
        entity_type="shift",
        entity_id=str(shift.id),
        previous=prev_snapshot,
        new=update_dict,
    )
    return _to_shift_response(shift)


@router.delete("/{shift_id}", status_code=status.HTTP_200_OK)
async def delete_shift(
    shift_id: str,
    request: Request,
    manager: User = Depends(require_manager_or_above),
):
    """Delete or deactivate a shift."""
    shift = await Shift.get(shift_id)
    if not shift:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Shift not found")

    await ShiftAssignment.find(ShiftAssignment.shift_id == shift_id).delete()
    await shift.delete()
    action_msg = "deleted"

    await log_audit(
        module=AuditModule.attendance,
        action="delete_shift",
        user=manager,
        request=request,
        entity_type="shift",
        entity_id=str(shift.id),
        previous={"name": shift.name, "code": shift.code},
        new={"action": action_msg},
    )
    return {"message": f"Shift '{shift.name}' {action_msg} successfully"}
