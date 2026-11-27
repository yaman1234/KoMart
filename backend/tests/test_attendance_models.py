"""Phase 1 Attendance & Checklist Model Validation Tests."""

import pytest
from datetime import datetime, timezone
from app.database import init_db
from app.models.attendance import (
    AttendanceRecord,
    AttendanceStatus,
    PunchSource,
    BreakType,
    BreakItem,
    Shift,
    ShiftAssignment,
    LeaveType,
    LeaveStatus,
    LeaveRequest,
)
from app.models.checklist import (
    ChecklistCategory,
    TargetRole,
    TemplateItem,
    ChecklistTemplate,
    ChecklistStatus,
    DailyChecklistItem,
    DailyChecklist,
)
from app.models.settings import StoreSettings, AttendanceConfig
from app.models.audit_log import AuditModule


@pytest.fixture(autouse=True)
async def setup_db():
    await init_db()


def test_audit_modules_include_attendance_and_checklists():
    assert AuditModule.attendance == "attendance"
    assert AuditModule.checklists == "checklists"


async def test_store_settings_has_attendance_config_defaults():
    settings = StoreSettings()
    assert isinstance(settings.attendance_config, AttendanceConfig)
    assert settings.attendance_config.attendance_enabled is True
    assert settings.attendance_config.enforce_store_ip is False
    assert settings.attendance_config.allowed_ips == []
    assert settings.attendance_config.require_clock_in_for_pos is False
    assert settings.attendance_config.auto_clock_out_hours == 14


async def test_attendance_record_defaults():
    record = AttendanceRecord(
        user_id="user-123",
        user_name="Bikash Thapa",
        user_role="cashier",
        date="2026-11-26",
    )
    assert record.user_id == "user-123"
    assert record.user_name == "Bikash Thapa"
    assert record.user_role == "cashier"
    assert record.date == "2026-11-26"
    assert record.status == AttendanceStatus.absent
    assert record.source == PunchSource.web_portal
    assert record.breaks == []
    assert record.is_on_break is False
    assert record.current_break_type is None
    assert record.total_work_minutes == 0
    assert record.total_break_minutes == 0
    assert record.effective_work_minutes == 0
    assert record.overtime_minutes == 0
    assert record.late_minutes == 0
    assert record.early_exit_minutes == 0
    assert record.is_regularized is False


async def test_shift_model_defaults():
    shift = Shift(
        name="Morning Cashier Shift",
        code="MORN_TEST",
        start_time="08:00",
        end_time="16:00",
    )
    assert shift.grace_period_minutes == 15
    assert shift.half_day_threshold_minutes == 240
    assert shift.full_day_threshold_minutes == 420
    assert shift.break_allowance_minutes == 60
    assert shift.is_active is True
    assert shift.days_of_week == [0, 1, 2, 3, 4, 5, 6]


async def test_shift_assignment_model():
    assignment = ShiftAssignment(
        user_id="user-123",
        user_name="Bikash Thapa",
        shift_id="shift-morn",
        shift_name="Morning Cashier Shift",
        effective_from="2026-11-26",
        assigned_by="manager-001",
    )
    assert assignment.user_id == "user-123"
    assert assignment.effective_to is None


async def test_leave_request_model():
    leave = LeaveRequest(
        user_id="user-123",
        user_name="Bikash Thapa",
        leave_type=LeaveType.casual,
        start_date="2026-12-01",
        end_date="2026-12-02",
        days_count=2.0,
        reason="Personal family event",
    )
    assert leave.status == LeaveStatus.pending
    assert leave.is_half_day is False
    assert leave.reviewed_by is None


async def test_checklist_template_and_daily_checklist():
    template = ChecklistTemplate(
        title="Cashier Morning Register Opening",
        category=ChecklistCategory.opening,
        target_role=TargetRole.cashier,
        created_by="manager-1",
        created_by_name="Ramesh Manager",
        items=[
            TemplateItem(
                id="item-1",
                title="Count & Verify Opening Float",
                is_mandatory=True,
                requires_numeric_input=True,
                numeric_unit="NPR",
            )
        ],
    )
    assert template.is_active is True
    assert template.auto_generate_daily is True
    assert len(template.items) == 1
    assert template.items[0].requires_numeric_input is True

    daily = DailyChecklist(
        template_id=str(template.id) if template.id else None,
        title=template.title,
        category=template.category,
        date="2026-11-26",
        target_role=template.target_role,
        assigned_by_user_id="manager-1",
        assigned_by_user_name="Ramesh Manager",
        items=[
            DailyChecklistItem(
                id="item-1",
                title="Count & Verify Opening Float",
                is_mandatory=True,
            )
        ],
        total_items_count=1,
    )
    assert daily.status == ChecklistStatus.pending
    assert daily.completion_rate == 0.0
    assert daily.completed_items_count == 0


async def test_seeded_shifts():
    # Verify shifts list query works cleanly
    shifts = await Shift.find_all().to_list()
    assert isinstance(shifts, list)
