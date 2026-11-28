"""Attendance calculation rules engine & helper service."""

from datetime import datetime, timezone, timedelta
from typing import Optional, Tuple
from zoneinfo import ZoneInfo

from app.models.attendance import (
    AttendanceRecord,
    AttendanceStatus,
    BreakItem,
    BreakType,
    Shift,
    ShiftAssignment,
    LeaveRequest,
    LeaveStatus,
)
from app.models.settings import StoreSettings
from app.schemas.attendance import (
    AttendanceRecordResponse,
    BreakItemResponse,
    AttendanceTodayStatusResponse,
)

# Nepal Standard Time (UTC+05:45)
NPT_TIMEZONE = ZoneInfo("Asia/Kathmandu")


def ensure_utc(dt: Optional[datetime]) -> Optional[datetime]:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def get_current_npt_time() -> datetime:
    return datetime.now(timezone.utc).astimezone(NPT_TIMEZONE)


def get_today_npt_date_str() -> str:
    return get_current_npt_time().strftime("%Y-%m-%d")


def time_str_to_minutes(time_str: str) -> int:
    """Parse HH:MM into minutes from midnight."""
    parts = time_str.split(":")
    hours = int(parts[0])
    minutes = int(parts[1]) if len(parts) > 1 else 0
    return hours * 60 + minutes


async def get_user_shift_for_date(user_id: str, date_str: str) -> Optional[Shift]:
    """Find user's assigned shift for the given date, or fallback to default store shift."""
    # Check explicit assignment
    assignment = (
        await ShiftAssignment.find(
            ShiftAssignment.user_id == user_id,
            ShiftAssignment.effective_from <= date_str,
        )
        .sort("-effective_from")
        .first_or_none()
    )

    if assignment and assignment.shift_id:
        if assignment.effective_to is None or assignment.effective_to >= date_str:
            shift = await Shift.get(assignment.shift_id)
            if shift and shift.is_active:
                return shift

    # Check store default shift
    settings = await StoreSettings.find_one()
    if settings and settings.attendance_config.default_shift_id:
        shift = await Shift.get(settings.attendance_config.default_shift_id)
        if shift and shift.is_active:
            return shift

    # Fallback to first active shift
    return await Shift.find(Shift.is_active == True).first_or_none()  # noqa: E712


def evaluate_punch_in(clock_in_time: datetime, shift: Optional[Shift]) -> Tuple[AttendanceStatus, int]:
    """Calculate status (present/late) and late_minutes based on shift start and grace period."""
    if not shift:
        return AttendanceStatus.present, 0

    utc_dt = ensure_utc(clock_in_time)
    local_dt = utc_dt.astimezone(NPT_TIMEZONE)
    actual_mins = local_dt.hour * 60 + local_dt.minute

    shift_start_mins = time_str_to_minutes(shift.start_time)
    grace_deadline_mins = shift_start_mins + shift.grace_period_minutes

    if actual_mins <= grace_deadline_mins:
        return AttendanceStatus.present, 0
    else:
        late_mins = max(0, actual_mins - shift_start_mins)
        return AttendanceStatus.late, late_mins


def calculate_break_totals(breaks: list[BreakItem]) -> int:
    """Calculate total completed break time in minutes."""
    total = 0
    for b in breaks:
        if b.duration_minutes > 0:
            total += b.duration_minutes
        elif b.end_time and b.start_time:
            end = ensure_utc(b.end_time)
            start = ensure_utc(b.start_time)
            if end and start:
                diff = int((end - start).total_seconds() // 60)
                total += max(0, diff)
    return total


def calculate_durations_and_status(
    record: AttendanceRecord,
    shift: Optional[Shift],
) -> None:
    """Recompute total work minutes, break minutes, overtime, early exit, and final status on clock-out."""
    clock_in = ensure_utc(record.clock_in)
    clock_out = ensure_utc(record.clock_out)
    if not clock_in or not clock_out:
        return

    # Gross work minutes
    gross_seconds = (clock_out - clock_in).total_seconds()
    record.total_work_minutes = max(0, int(gross_seconds // 60))

    # Total break minutes
    record.total_break_minutes = calculate_break_totals(record.breaks)

    # Net effective working minutes
    record.effective_work_minutes = max(0, record.total_work_minutes - record.total_break_minutes)

    if shift:
        # Half-day check
        if record.effective_work_minutes < shift.half_day_threshold_minutes:
            record.status = AttendanceStatus.half_day

        # Shift duration & Overtime check
        start_mins = time_str_to_minutes(shift.start_time)
        end_mins = time_str_to_minutes(shift.end_time)
        scheduled_mins = end_mins - start_mins
        if scheduled_mins < 0:
            scheduled_mins += 24 * 60  # Shift crossing midnight

        if record.effective_work_minutes > scheduled_mins:
            record.overtime_minutes = record.effective_work_minutes - scheduled_mins
        else:
            record.overtime_minutes = 0

        # Early exit check
        local_out = clock_out.astimezone(NPT_TIMEZONE)
        actual_out_mins = local_out.hour * 60 + local_out.minute
        if actual_out_mins < end_mins:
            record.early_exit_minutes = max(0, end_mins - actual_out_mins)
        else:
            record.early_exit_minutes = 0


def verify_store_network(client_ip: Optional[str], settings: Optional[StoreSettings]) -> bool:
    """Verify IP address / CIDR subnet if network lock is enabled in store settings."""
    if not settings:
        return True
    config = settings.attendance_config
    if not config.enforce_store_ip:
        return True
    if not client_ip:
        return False
    import ipaddress

    try:
        addr = ipaddress.ip_address(client_ip.strip())
    except ValueError:
        return client_ip in config.allowed_ips

    for allowed in config.allowed_ips:
        entry = (allowed or "").strip()
        if not entry:
            continue
        if entry == client_ip.strip():
            return True
        try:
            if addr in ipaddress.ip_network(entry, strict=False):
                return True
        except ValueError:
            continue
    return False


def to_attendance_record_response(record: AttendanceRecord) -> AttendanceRecordResponse:
    return AttendanceRecordResponse(
        id=str(record.id),
        user_id=record.user_id,
        user_name=record.user_name,
        user_role=record.user_role,
        date=record.date,
        shift_id=record.shift_id,
        shift_name=record.shift_name,
        scheduled_start=record.scheduled_start,
        scheduled_end=record.scheduled_end,
        clock_in=ensure_utc(record.clock_in),
        clock_out=ensure_utc(record.clock_out),
        breaks=[
            BreakItemResponse(
                break_type=b.break_type,
                start_time=ensure_utc(b.start_time),
                end_time=ensure_utc(b.end_time),
                duration_minutes=b.duration_minutes,
                notes=b.notes,
            )
            for b in record.breaks
        ],
        is_on_break=record.is_on_break,
        current_break_type=record.current_break_type,
        total_work_minutes=record.total_work_minutes,
        total_break_minutes=record.total_break_minutes,
        effective_work_minutes=record.effective_work_minutes,
        overtime_minutes=record.overtime_minutes,
        late_minutes=record.late_minutes,
        early_exit_minutes=record.early_exit_minutes,
        status=record.status,
        source=record.source,
        ip_address=record.ip_address,
        device_info=record.device_info,
        notes=record.notes,
        is_regularized=record.is_regularized,
        regularization_reason=record.regularization_reason,
        regularized_by=record.regularized_by,
        regularized_at=record.regularized_at,
        created_at=record.created_at,
        updated_at=record.updated_at,
    )
