"""Phase 3 Shifts, Rostering & Leave Management API integration tests."""

import pytest
from datetime import datetime, timezone, timedelta
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.database import init_db
from app.models.user import User, UserRole
from app.models.attendance import (
    Shift,
    ShiftAssignment,
    LeaveRequest,
    LeaveStatus,
    LeaveType,
    AttendanceRecord,
    AttendanceStatus,
)
from app.auth.jwt import hash_password
from app.services.attendance_engine import get_today_npt_date_str


@pytest.fixture(autouse=True)
async def setup_db():
    await init_db()


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.fixture
async def manager_user():
    email = "shift-mgr@komart.com"
    existing = await User.find_one(User.email == email)
    if existing:
        await existing.delete()
    user = User(
        email=email,
        name="Shift Manager",
        hashed_password=hash_password("mgrpass123"),
        role=UserRole.manager,
        is_active=True,
    )
    await user.insert()
    yield user
    await user.delete()


@pytest.fixture
async def cashier_user():
    email = "shift-cashier@komart.com"
    existing = await User.find_one(User.email == email)
    if existing:
        await existing.delete()
    user = User(
        email=email,
        name="Shift Cashier",
        hashed_password=hash_password("cashierpass123"),
        role=UserRole.cashier,
        is_active=True,
    )
    await user.insert()
    yield user
    await AttendanceRecord.find(AttendanceRecord.user_id == str(user.id)).delete()
    await LeaveRequest.find(LeaveRequest.user_id == str(user.id)).delete()
    await ShiftAssignment.find(ShiftAssignment.user_id == str(user.id)).delete()
    await user.delete()


async def _login(client: AsyncClient, email: str, password: str) -> str:
    res = await client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert res.status_code == 200, res.text
    return res.json()["access_token"]


async def test_shifts_crud_and_assignment(
    client: AsyncClient,
    manager_user: User,
    cashier_user: User,
):
    mgr_token = await _login(client, manager_user.email, "mgrpass123")
    headers = {"Authorization": f"Bearer {mgr_token}"}

    # 1. List pre-seeded shifts
    res = await client.get("/api/v1/shifts", headers=headers)
    assert res.status_code == 200
    shifts = res.json()
    assert len(shifts) >= 3

    # 2. Create custom shift
    unique_code = f"NIGHT_{int(datetime.now().timestamp())}"
    res = await client.post(
        "/api/v1/shifts",
        json={
            "name": "Night Stocker Shift",
            "code": unique_code,
            "start_time": "22:00",
            "end_time": "06:00",
            "grace_period_minutes": 20,
            "color_code": "#1E293B",
        },
        headers=headers,
    )
    assert res.status_code == 201, res.text
    new_shift = res.json()
    shift_id = new_shift["id"]
    assert new_shift["name"] == "Night Stocker Shift"

    # Duplicate code fails
    res_dup = await client.post(
        "/api/v1/shifts",
        json={"name": "Duplicate", "code": unique_code, "start_time": "10:00", "end_time": "18:00"},
        headers=headers,
    )
    assert res_dup.status_code == 409

    # 3. Update shift
    res = await client.patch(
        f"/api/v1/shifts/{shift_id}",
        json={"grace_period_minutes": 25},
        headers=headers,
    )
    assert res.status_code == 200
    assert res.json()["grace_period_minutes"] == 25

    # 4. Assign shift to cashier
    res = await client.post(
        "/api/v1/shifts/assignments",
        json={
            "user_id": str(cashier_user.id),
            "shift_id": shift_id,
            "effective_from": "2026-11-01",
        },
        headers=headers,
    )
    assert res.status_code == 201, res.text
    assignment = res.json()
    assert assignment["user_name"] == cashier_user.name
    assert assignment["shift_name"] == "Night Stocker Shift"

    # 5. List assignments
    res = await client.get(f"/api/v1/shifts/assignments?user_id={cashier_user.id}", headers=headers)
    assert res.status_code == 200
    assignments = res.json()
    assert len(assignments) >= 1
    assign_id = assignment["id"]

    # 5b. Update assignment
    update_assign_res = await client.patch(
        f"/api/v1/shifts/assignments/{assign_id}",
        json={"effective_from": "2026-11-05", "effective_to": "2026-12-31"},
        headers=headers,
    )
    assert update_assign_res.status_code == 200
    updated_assign = update_assign_res.json()
    assert updated_assign["effective_from"] == "2026-11-05"
    assert updated_assign["effective_to"] == "2026-12-31"

    # 6. Delete shift with assignment (should deactivate)
    del_res = await client.delete(f"/api/v1/shifts/{shift_id}", headers=headers)
    assert del_res.status_code == 200
    assert "deactivated" in del_res.json()["message"]

    # 7. Create & delete unassigned shift (should delete permanently)
    temp_code = f"TMP_{int(datetime.now().timestamp())}"
    create_tmp = await client.post(
        "/api/v1/shifts",
        json={"name": "Temp Shift", "code": temp_code, "start_time": "12:00", "end_time": "18:00"},
        headers=headers,
    )
    assert create_tmp.status_code == 201
    tmp_id = create_tmp.json()["id"]
    del_tmp = await client.delete(f"/api/v1/shifts/{tmp_id}", headers=headers)
    assert del_tmp.status_code == 200
    assert "deleted" in del_tmp.json()["message"]

    # 8. Delete assignment
    del_assign_res = await client.delete(f"/api/v1/shifts/assignments/{assign_id}", headers=headers)
    assert del_assign_res.status_code == 200


async def test_leave_management_workflow(
    client: AsyncClient,
    cashier_user: User,
    manager_user: User,
):
    cashier_token = await _login(client, cashier_user.email, "cashierpass123")
    mgr_token = await _login(client, manager_user.email, "mgrpass123")

    c_headers = {"Authorization": f"Bearer {cashier_token}"}
    m_headers = {"Authorization": f"Bearer {mgr_token}"}

    # 1. Cashier creates leave request
    res = await client.post(
        "/api/v1/leaves",
        json={
            "leave_type": "sick",
            "start_date": "2026-12-05",
            "end_date": "2026-12-06",
            "days_count": 2.0,
            "reason": "Doctor appointment and recovery",
        },
        headers=c_headers,
    )
    assert res.status_code == 201, res.text
    leave = res.json()
    leave_id = leave["id"]
    assert leave["status"] == "pending"

    # Invalid dates fail
    res_inv = await client.post(
        "/api/v1/leaves",
        json={
            "leave_type": "sick",
            "start_date": "2026-12-10",
            "end_date": "2026-12-05",
            "reason": "Invalid",
        },
        headers=c_headers,
    )
    assert res_inv.status_code == 400

    # 2. Manager reviews and approves leave
    res = await client.patch(
        f"/api/v1/leaves/{leave_id}/review",
        json={"decision": "approved"},
        headers=m_headers,
    )
    assert res.status_code == 200, res.text
    approved_leave = res.json()
    assert approved_leave["status"] == "approved"
    assert approved_leave["reviewed_by_name"] == manager_user.name

    # 3. Second leave request - cancel test
    res2 = await client.post(
        "/api/v1/leaves",
        json={
            "leave_type": "casual",
            "start_date": "2026-12-20",
            "end_date": "2026-12-20",
            "days_count": 1.0,
            "reason": "Family wedding",
        },
        headers=c_headers,
    )
    assert res2.status_code == 201
    leave2_id = res2.json()["id"]

    # Cashier cancels their own pending leave
    res = await client.delete(f"/api/v1/leaves/{leave2_id}", headers=c_headers)
    assert res.status_code == 200
    res_check = await client.get(f"/api/v1/leaves/{leave2_id}", headers=c_headers)
    assert res_check.json()["status"] == "cancelled"


async def test_attendance_records_list_and_regularization(
    client: AsyncClient,
    cashier_user: User,
    manager_user: User,
):
    cashier_token = await _login(client, cashier_user.email, "cashierpass123")
    mgr_token = await _login(client, manager_user.email, "mgrpass123")

    c_headers = {"Authorization": f"Bearer {cashier_token}"}
    m_headers = {"Authorization": f"Bearer {mgr_token}"}

    # Cashier clocks in
    res = await client.post(
        "/api/v1/attendance/punch",
        json={"action": "clock_in"},
        headers=c_headers,
    )
    assert res.status_code == 200
    record_id = res.json()["id"]

    # Manager lists records
    res = await client.get(f"/api/v1/attendance/records?user_id={cashier_user.id}", headers=m_headers)
    assert res.status_code == 200
    records = res.json()
    assert len(records) >= 1

    # Manager regularizes the record (sets custom clock in/out)
    now = datetime.now(timezone.utc)
    res = await client.patch(
        f"/api/v1/attendance/records/{record_id}",
        json={
            "clock_in": (now - timedelta(hours=8)).isoformat(),
            "clock_out": now.isoformat(),
            "status": "present",
            "reason": "Staff forgot to punch out due to high customer rush at till",
        },
        headers=m_headers,
    )
    assert res.status_code == 200, res.text
    regularized = res.json()
    assert regularized["is_regularized"] is True
    assert regularized["regularized_by"] == manager_user.name
    assert regularized["regularization_reason"] == "Staff forgot to punch out due to high customer rush at till"
    assert regularized["total_work_minutes"] > 0
