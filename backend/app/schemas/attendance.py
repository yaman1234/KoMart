from pydantic import BaseModel, Field
from typing import Optional, List
from enum import Enum
from datetime import datetime

from app.models.attendance import (
    AttendanceStatus,
    PunchSource,
    BreakType,
)


class PunchAction(str, Enum):
    clock_in = "clock_in"
    break_start = "break_start"
    break_end = "break_end"
    clock_out = "clock_out"


class PunchRequest(BaseModel):
    action: PunchAction
    break_type: Optional[BreakType] = None
    notes: Optional[str] = None
    device_info: Optional[str] = None


class BreakItemResponse(BaseModel):
    break_type: BreakType
    start_time: datetime
    end_time: Optional[datetime] = None
    duration_minutes: int = 0
    notes: Optional[str] = None


class AttendanceRecordResponse(BaseModel):
    id: str
    user_id: str
    user_name: str
    user_role: str
    date: str

    shift_id: Optional[str] = None
    shift_name: Optional[str] = None
    scheduled_start: Optional[str] = None
    scheduled_end: Optional[str] = None

    clock_in: Optional[datetime] = None
    clock_out: Optional[datetime] = None

    breaks: List[BreakItemResponse] = Field(default_factory=list)
    is_on_break: bool = False
    current_break_type: Optional[BreakType] = None

    total_work_minutes: int = 0
    total_break_minutes: int = 0
    effective_work_minutes: int = 0
    overtime_minutes: int = 0
    late_minutes: int = 0
    early_exit_minutes: int = 0

    status: AttendanceStatus
    source: PunchSource

    ip_address: Optional[str] = None
    device_info: Optional[str] = None
    notes: Optional[str] = None

    is_regularized: bool = False
    regularization_reason: Optional[str] = None
    regularized_by: Optional[str] = None
    regularized_at: Optional[datetime] = None

    created_at: datetime
    updated_at: datetime


class AttendanceTodayStatusResponse(BaseModel):
    has_clocked_in: bool
    has_clocked_out: bool
    is_on_break: bool
    current_break_type: Optional[BreakType] = None
    active_break_start: Optional[datetime] = None
    elapsed_work_minutes: int = 0
    record: Optional[AttendanceRecordResponse] = None
    shift: Optional[dict] = None


class RegularizeRequest(BaseModel):
    date: str  # YYYY-MM-DD
    clock_in: Optional[datetime] = None
    clock_out: Optional[datetime] = None
    reason: str


class AttendanceAdjustmentRequest(BaseModel):
    clock_in: Optional[datetime] = None
    clock_out: Optional[datetime] = None
    status: Optional[AttendanceStatus] = None
    reason: str


class AttendanceKPIResponse(BaseModel):
    date: str
    total_staff: int = 0
    present_count: int = 0
    on_floor_count: int = 0
    on_break_count: int = 0
    late_count: int = 0
    absent_count: int = 0
    on_leave_count: int = 0
