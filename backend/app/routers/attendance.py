from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from typing import List, Optional
from datetime import datetime, timezone

from app.auth.dependencies import get_current_user, require_manager_or_above
from app.models.user import User
from app.models.attendance import (
    AttendanceRecord,
    AttendanceStatus,
    BreakItem,
    BreakType,
    PunchSource,
    LeaveRequest,
    LeaveStatus,
)
from app.models.settings import StoreSettings
from app.models.audit_log import AuditModule
from app.services.audit import log_audit
from app.schemas.attendance import (
    PunchAction,
    PunchRequest,
    AttendanceRecordResponse,
    AttendanceTodayStatusResponse,
    AttendanceKPIResponse,
    BreakItemResponse,
    AttendanceAdjustmentRequest,
)
from app.services.attendance_engine import (
    get_today_npt_date_str,
    get_user_shift_for_date,
    evaluate_punch_in,
    calculate_break_totals,
    calculate_durations_and_status,
    verify_store_network,
    to_attendance_record_response,
    ensure_utc,
)

router = APIRouter(prefix="/attendance", tags=["Attendance"])


def _get_client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else ""


@router.post("/punch", response_model=AttendanceRecordResponse)
async def punch_attendance(
    body: PunchRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
):
    """Core punch action: clock_in, break_start, break_end, clock_out."""
    now_utc = datetime.now(timezone.utc)
    today_date = get_today_npt_date_str()
    client_ip = _get_client_ip(request)

    settings = await StoreSettings.find_one()
    if settings and hasattr(settings, "attendance_config") and settings.attendance_config:
        if not settings.attendance_config.attendance_enabled:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Staff attendance module is currently disabled in store settings",
            )

    if not verify_store_network(client_ip, settings):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Attendance punches are restricted to store Wi-Fi network",
        )

    user_id = str(current_user.id)
    record = await AttendanceRecord.find_one(
        AttendanceRecord.user_id == user_id,
        AttendanceRecord.date == today_date,
    )

    if body.action == PunchAction.clock_in:
        if record and record.clock_in:
            local_time_str = record.clock_in.strftime("%H:%M")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Already clocked in today at {local_time_str}",
            )

        shift = await get_user_shift_for_date(user_id, today_date)
        punch_status, late_mins = evaluate_punch_in(now_utc, shift)

        # Check if user had an approved leave today
        approved_leave = await LeaveRequest.find_one(
            LeaveRequest.user_id == user_id,
            LeaveRequest.start_date <= today_date,
            LeaveRequest.end_date >= today_date,
            LeaveRequest.status == LeaveStatus.approved,
        )
        if approved_leave:
            # Arrived despite approved leave; record presence
            punch_status = AttendanceStatus.present

        if not record:
            record = AttendanceRecord(
                user_id=user_id,
                user_name=current_user.name,
                user_role=current_user.role.value if hasattr(current_user.role, "value") else str(current_user.role),
                date=today_date,
                shift_id=str(shift.id) if shift and shift.id else None,
                shift_name=shift.name if shift else None,
                scheduled_start=shift.start_time if shift else None,
                scheduled_end=shift.end_time if shift else None,
                clock_in=now_utc,
                status=punch_status,
                late_minutes=late_mins,
                source=PunchSource.web_portal,
                ip_address=client_ip,
                device_info=body.device_info or request.headers.get("user-agent", ""),
                notes=body.notes,
            )
            await record.insert()
        else:
            record.clock_in = now_utc
            record.status = punch_status
            record.late_minutes = late_mins
            record.shift_id = str(shift.id) if shift and shift.id else record.shift_id
            record.shift_name = shift.name if shift else record.shift_name
            record.scheduled_start = shift.start_time if shift else record.scheduled_start
            record.scheduled_end = shift.end_time if shift else record.scheduled_end
            record.ip_address = client_ip
            if body.notes:
                record.notes = body.notes
            record.updated_at = now_utc
            await record.save()

        await log_audit(
            module=AuditModule.attendance,
            action="clock_in",
            user=current_user,
            request=request,
            entity_type="attendance_record",
            entity_id=str(record.id),
            new={
                "date": record.date,
                "status": record.status.value,
                "late_minutes": record.late_minutes,
                "clock_in": record.clock_in.isoformat(),
            },
        )
        return to_attendance_record_response(record)

    elif body.action == PunchAction.break_start:
        if not record or not record.clock_in:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot start a break before clocking in.",
            )
        if record.clock_out:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot start a break after clocking out.",
            )
        if record.is_on_break:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Already on break.",
            )

        break_type = body.break_type or BreakType.tea
        break_item = BreakItem(
            break_type=break_type,
            start_time=now_utc,
            notes=body.notes,
        )
        record.breaks.append(break_item)
        record.is_on_break = True
        record.current_break_type = break_type
        record.updated_at = now_utc
        await record.save()
        return to_attendance_record_response(record)

    elif body.action == PunchAction.break_end:
        if not record or not record.is_on_break or not record.breaks:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Not currently on break.",
            )

        last_break = record.breaks[-1]
        last_break.end_time = now_utc
        start_time = ensure_utc(last_break.start_time)
        diff_mins = max(0, int((now_utc - start_time).total_seconds() // 60)) if start_time else 0
        last_break.duration_minutes = diff_mins

        record.is_on_break = False
        record.current_break_type = None
        record.total_break_minutes = calculate_break_totals(record.breaks)
        record.updated_at = now_utc
        await record.save()
        return to_attendance_record_response(record)

    elif body.action == PunchAction.clock_out:
        if not record or not record.clock_in:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot clock out without clocking in first.",
            )
        if record.clock_out:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Already clocked out today.",
            )

        # Auto-close open break if still on break
        if record.is_on_break and record.breaks:
            last_break = record.breaks[-1]
            last_break.end_time = now_utc
            start_time = ensure_utc(last_break.start_time)
            last_break.duration_minutes = max(0, int((now_utc - start_time).total_seconds() // 60)) if start_time else 0
            record.is_on_break = False
            record.current_break_type = None

        record.clock_out = now_utc
        shift = await get_user_shift_for_date(user_id, today_date)
        calculate_durations_and_status(record, shift)
        if body.notes:
            record.notes = (record.notes + " | " + body.notes) if record.notes else body.notes
        record.updated_at = now_utc
        await record.save()

        await log_audit(
            module=AuditModule.attendance,
            action="clock_out",
            user=current_user,
            request=request,
            entity_type="attendance_record",
            entity_id=str(record.id),
            new={
                "date": record.date,
                "status": record.status.value,
                "total_work_minutes": record.total_work_minutes,
                "effective_work_minutes": record.effective_work_minutes,
                "clock_out": record.clock_out.isoformat(),
            },
        )
        return to_attendance_record_response(record)

    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported punch action: {body.action}",
        )


@router.get("/today", response_model=AttendanceTodayStatusResponse)
async def get_today_attendance(
    current_user: User = Depends(get_current_user),
):
    """Get live attendance status for current user today."""
    now_utc = datetime.now(timezone.utc)
    today_date = get_today_npt_date_str()
    user_id = str(current_user.id)

    record = await AttendanceRecord.find_one(
        AttendanceRecord.user_id == user_id,
        AttendanceRecord.date == today_date,
    )

    shift = await get_user_shift_for_date(user_id, today_date)
    shift_dict = (
        {
            "id": str(shift.id),
            "name": shift.name,
            "start_time": shift.start_time,
            "end_time": shift.end_time,
            "grace_period_minutes": shift.grace_period_minutes,
        }
        if shift
        else None
    )

    if not record or not record.clock_in:
        return AttendanceTodayStatusResponse(
            has_clocked_in=False,
            has_clocked_out=False,
            is_on_break=False,
            record=to_attendance_record_response(record) if record else None,
            shift=shift_dict,
        )

    has_out = bool(record.clock_out)
    is_break = record.is_on_break
    active_break_start = None
    if is_break and record.breaks:
        active_break_start = record.breaks[-1].start_time

    # Calculate real-time elapsed work minutes
    if has_out:
        elapsed = record.effective_work_minutes
    else:
        clock_in_dt = ensure_utc(record.clock_in)
        gross_mins = max(0, int((now_utc - clock_in_dt).total_seconds() // 60)) if clock_in_dt else 0
        break_mins = calculate_break_totals(record.breaks)
        if is_break and record.breaks and record.breaks[-1].start_time:
            brk_start = ensure_utc(record.breaks[-1].start_time)
            current_break_mins = max(0, int((now_utc - brk_start).total_seconds() // 60)) if brk_start else 0
            break_mins += current_break_mins
        elapsed = max(0, gross_mins - break_mins)

    return AttendanceTodayStatusResponse(
        has_clocked_in=True,
        has_clocked_out=has_out,
        is_on_break=is_break,
        current_break_type=record.current_break_type,
        active_break_start=active_break_start,
        elapsed_work_minutes=elapsed,
        record=to_attendance_record_response(record),
        shift=shift_dict,
    )


@router.get("/my-history", response_model=List[AttendanceRecordResponse])
async def get_my_attendance_history(
    month: Optional[str] = Query(None, description="Filter by YYYY-MM"),
    limit: int = Query(31, ge=1, le=100),
    current_user: User = Depends(get_current_user),
):
    """Monthly timesheet history for logged-in user."""
    user_id = str(current_user.id)
    query = [AttendanceRecord.user_id == user_id]
    if month:
        # Regex or prefix match for month
        query.append(AttendanceRecord.date >= f"{month}-01")
        query.append(AttendanceRecord.date <= f"{month}-31")

    records = (
        await AttendanceRecord.find(*query)
        .sort("-date")
        .limit(limit)
        .to_list()
    )
    return [to_attendance_record_response(r) for r in records]


@router.get("/live-roster", response_model=List[AttendanceRecordResponse])
async def get_live_roster(
    date: Optional[str] = Query(None, description="Date in YYYY-MM-DD format (defaults to today)"),
    _: User = Depends(require_manager_or_above),
):
    """Manager Live Roster: Floor presence, break state, and punctuality for store staff."""
    target_date = date or get_today_npt_date_str()
    records = await AttendanceRecord.find(AttendanceRecord.date == target_date).sort("user_name").to_list()
    return [to_attendance_record_response(r) for r in records]


@router.get("/summary", response_model=AttendanceKPIResponse)
async def get_attendance_summary(
    date: Optional[str] = Query(None, description="Date in YYYY-MM-DD format (defaults to today)"),
    _: User = Depends(require_manager_or_above),
):
    """Daily KPI summary cards for managers."""
    target_date = date or get_today_npt_date_str()
    total_active_staff = await User.find(User.is_active == True).count()  # noqa: E712
    records = await AttendanceRecord.find(AttendanceRecord.date == target_date).to_list()

    present_count = 0
    on_floor_count = 0
    on_break_count = 0
    late_count = 0
    absent_count = 0
    on_leave_count = 0

    record_user_ids = set()
    for r in records:
        record_user_ids.add(r.user_id)
        if r.status in (AttendanceStatus.present, AttendanceStatus.late, AttendanceStatus.half_day):
            present_count += 1
            if r.status == AttendanceStatus.late:
                late_count += 1
            if r.is_on_break:
                on_break_count += 1
            elif not r.clock_out:
                on_floor_count += 1
        elif r.status == AttendanceStatus.on_leave:
            on_leave_count += 1
        elif r.status == AttendanceStatus.absent:
            absent_count += 1

    # Any staff without a record who isn't clocked in is counted as absent/pending
    absent_count += max(0, total_active_staff - len(record_user_ids))

    return AttendanceKPIResponse(
        date=target_date,
        total_staff=total_active_staff,
        present_count=present_count,
        on_floor_count=on_floor_count,
        on_break_count=on_break_count,
        late_count=late_count,
        absent_count=absent_count,
        on_leave_count=on_leave_count,
    )


@router.get("/records", response_model=List[AttendanceRecordResponse])
async def list_attendance_records(
    date: Optional[str] = Query(None, description="YYYY-MM-DD"),
    user_id: Optional[str] = Query(None),
    status_filter: Optional[AttendanceStatus] = Query(None, alias="status"),
    limit: int = Query(50, ge=1, le=200),
    _: User = Depends(require_manager_or_above),
):
    """List attendance records with filters for managers."""
    query = []
    if date:
        query.append(AttendanceRecord.date == date)
    if user_id:
        query.append(AttendanceRecord.user_id == user_id)
    if status_filter:
        query.append(AttendanceRecord.status == status_filter)

    records = await AttendanceRecord.find(*query).sort("-date").limit(limit).to_list()
    return [to_attendance_record_response(r) for r in records]


@router.patch("/records/{record_id}", response_model=AttendanceRecordResponse)
async def regularize_attendance_record(
    record_id: str,
    body: AttendanceAdjustmentRequest,
    request: Request,
    manager: User = Depends(require_manager_or_above),
):
    """Regularize / manually adjust an attendance record with audit trail."""
    try:
        record = await AttendanceRecord.get(record_id)
    except Exception:
        record = None
    if not record:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Attendance record not found")

    now_utc = datetime.now(timezone.utc)
    prev_snapshot = {
        "status": record.status.value,
        "clock_in": record.clock_in.isoformat() if record.clock_in else None,
        "clock_out": record.clock_out.isoformat() if record.clock_out else None,
        "total_work_minutes": record.total_work_minutes,
        "effective_work_minutes": record.effective_work_minutes,
    }

    if body.clock_in is not None:
        record.clock_in = ensure_utc(body.clock_in)
    if body.clock_out is not None:
        record.clock_out = ensure_utc(body.clock_out)
    if body.status is not None:
        record.status = body.status

    shift = await get_user_shift_for_date(record.user_id, record.date)
    if body.clock_in is not None and record.clock_in is not None:
        eval_status, late_mins = evaluate_punch_in(record.clock_in, shift)
        record.late_minutes = late_mins
        if body.status is None and record.clock_out is None:
            record.status = eval_status
    if body.clock_out is not None and record.clock_out is not None:
        record.is_on_break = False
        record.current_break_type = None
        for b in record.breaks:
            if b.end_time is None and b.start_time is not None:
                b.end_time = record.clock_out
                diff = int((ensure_utc(b.end_time) - ensure_utc(b.start_time)).total_seconds() // 60)
                b.duration_minutes = max(0, diff)
    calculate_durations_and_status(record, shift)

    # If manager explicitly set status, prioritize manager's override
    if body.status is not None:
        record.status = body.status

    record.is_regularized = True
    record.regularization_reason = body.reason
    record.regularized_by = manager.name
    record.regularized_at = now_utc
    record.updated_at = now_utc
    await record.save()

    await log_audit(
        module=AuditModule.attendance,
        action="regularize_record",
        user=manager,
        request=request,
        entity_type="attendance_record",
        entity_id=str(record.id),
        previous=prev_snapshot,
        new={
            "status": record.status.value,
            "clock_in": record.clock_in.isoformat() if record.clock_in else None,
            "clock_out": record.clock_out.isoformat() if record.clock_out else None,
            "total_work_minutes": record.total_work_minutes,
            "effective_work_minutes": record.effective_work_minutes,
            "reason": body.reason,
            "regularized_by": manager.name,
        },
    )
    return to_attendance_record_response(record)
