from beanie import Document, Indexed
from pydantic import BaseModel, Field
from typing import List, Optional
from enum import Enum
from datetime import datetime, timezone
from pymongo import IndexModel, ASCENDING, DESCENDING


class AttendanceStatus(str, Enum):
    present = "present"
    late = "late"
    half_day = "half_day"
    absent = "absent"
    on_leave = "on_leave"
    holiday = "holiday"
    day_off = "day_off"


class PunchSource(str, Enum):
    pos_terminal = "pos_terminal"
    web_portal = "web_portal"
    mobile_web = "mobile_web"
    manager_manual = "manager_manual"
    auto_system = "auto_system"


class BreakType(str, Enum):
    lunch = "lunch"
    tea = "tea"
    personal = "personal"


class BreakItem(BaseModel):
    break_type: BreakType = BreakType.tea
    start_time: datetime
    end_time: Optional[datetime] = None
    duration_minutes: int = 0
    notes: Optional[str] = None


class AttendanceRecord(Document):
    user_id: Indexed(str)
    user_name: str
    user_role: str  # cashier, manager, admin, staff
    date: Indexed(str)  # YYYY-MM-DD

    # Shift Reference
    shift_id: Optional[str] = None
    shift_name: Optional[str] = None
    scheduled_start: Optional[str] = None  # HH:MM
    scheduled_end: Optional[str] = None    # HH:MM

    # Punch Timestamps (UTC)
    clock_in: Optional[datetime] = None
    clock_out: Optional[datetime] = None

    # Breaks
    breaks: List[BreakItem] = Field(default_factory=list)
    is_on_break: bool = False
    current_break_type: Optional[BreakType] = None

    # Calculated Durations (Minutes)
    total_work_minutes: int = 0
    total_break_minutes: int = 0
    effective_work_minutes: int = 0  # total_work_minutes - total_break_minutes
    overtime_minutes: int = 0
    late_minutes: int = 0
    early_exit_minutes: int = 0

    # Status & Source
    status: AttendanceStatus = AttendanceStatus.absent
    source: PunchSource = PunchSource.web_portal

    # Network / Context
    ip_address: Optional[str] = None
    device_info: Optional[str] = None
    notes: Optional[str] = None

    # Regularization / Manual Adjustments
    is_regularized: bool = False
    regularization_reason: Optional[str] = None
    regularized_by: Optional[str] = None
    regularized_at: Optional[datetime] = None

    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "attendance_records"
        indexes = [
            IndexModel([("user_id", ASCENDING), ("date", ASCENDING)], unique=True),
            IndexModel([("date", ASCENDING), ("status", ASCENDING)]),
            IndexModel([("date", ASCENDING), ("is_on_break", ASCENDING)]),
            IndexModel([("user_id", ASCENDING), ("status", ASCENDING)]),
            IndexModel([("date", DESCENDING)]),
        ]


class Shift(Document):
    name: str  # e.g., "Morning Cashier Shift", "Evening Shift"
    code: Indexed(str, unique=True)  # e.g., "MORN", "EVE", "FULL"
    start_time: str  # "08:00" (24-hr format)
    end_time: str    # "16:00"

    # Thresholds & Rules
    grace_period_minutes: int = 15        # Clocking in up to start + grace is still considered on time
    half_day_threshold_minutes: int = 240 # Minimum 4 hrs for half-day
    full_day_threshold_minutes: int = 420 # Minimum 7 hrs for full-day
    break_allowance_minutes: int = 60     # Paid/allowed break time

    color_code: str = "#2563EB"  # For calendar/roster visual UI
    is_active: bool = True
    days_of_week: List[int] = Field(default_factory=lambda: [0, 1, 2, 3, 4, 5, 6])  # 0=Mon, 6=Sun

    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "shifts"
        indexes = [
            IndexModel([("code", ASCENDING)], unique=True),
            IndexModel([("is_active", ASCENDING)]),
        ]


class ShiftAssignment(Document):
    user_id: Indexed(str)
    user_name: str
    shift_id: str
    shift_name: str
    effective_from: str  # YYYY-MM-DD
    effective_to: Optional[str] = None  # None = indefinite
    assigned_by: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "shift_assignments"
        indexes = [
            IndexModel([("user_id", ASCENDING), ("effective_from", DESCENDING)]),
        ]


class LeaveType(str, Enum):
    casual = "casual"
    sick = "sick"
    annual = "annual"
    unpaid = "unpaid"
    maternity_paternity = "maternity_paternity"


class LeaveStatus(str, Enum):
    pending = "pending"
    approved = "approved"
    rejected = "rejected"
    cancelled = "cancelled"


class LeaveRequest(Document):
    user_id: Indexed(str)
    user_name: str
    leave_type: LeaveType
    start_date: str  # YYYY-MM-DD
    end_date: str    # YYYY-MM-DD
    days_count: float = 1.0  # 0.5 for half day
    is_half_day: bool = False
    reason: str
    status: LeaveStatus = LeaveStatus.pending

    # Approval metadata
    reviewed_by: Optional[str] = None
    reviewed_by_name: Optional[str] = None
    reviewed_at: Optional[datetime] = None
    rejection_reason: Optional[str] = None

    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "leave_requests"
        indexes = [
            IndexModel([("user_id", ASCENDING), ("status", ASCENDING)]),
            IndexModel([("start_date", ASCENDING), ("end_date", ASCENDING)]),
            IndexModel([("status", ASCENDING)]),
        ]
