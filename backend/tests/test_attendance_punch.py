"""Attendance Punch API integration tests."""

import pytest
from datetime import datetime, timezone, timedelta
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.database import init_db
from app.models.user import User, UserRole
from app.models.attendance import (
    AttendanceRecord,
    AttendanceStatus,
    BreakType,
    Shift,
)
from app.models.settings import StoreSettings
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
async def cashier_user():
    email = "punch-cashier@komart.com"
    existing = await User.find_one(User.email == email)
    if existing:
        await existing.delete()
    user = User(
        email=email,
        name="Punch Cashier",
        hashed_password=hash_password("cashierpass123"),
        role=UserRole.cashier,
        is_active=True,
    )
    await user.insert()
    yield user
    # Clean up today's attendance records for this user
    today = get_today_npt_date_str()
    await AttendanceRecord.find(AttendanceRecord.user_id == str(user.id)).delete()
    await user.delete()


@pytest.fixture
async def manager_user():
    email = "punch-manager@komart.com"
    existing = await User.find_one(User.email == email)
    if existing:
        await existing.delete()
    user = User(
        email=email,
        name="Punch Manager",
        hashed_password=hash_password("managerpass123"),
        role=UserRole.manager,
        is_active=True,
    )
    await user.insert()
    yield user
    await AttendanceRecord.find(AttendanceRecord.user_id == str(user.id)).delete()
    await user.delete()


async def _login(client: AsyncClient, email: str, password: str) -> str:
    res = await client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert res.status_code == 200, res.text
    return res.json()["access_token"]


async def test_punch_lifecycle_clock_in_break_clock_out(client: AsyncClient, cashier_user: User):
    token = await _login(client, cashier_user.email, "cashierpass123")
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Check /today before clock in
    res = await client.get("/api/v1/attendance/today", headers=headers)
    assert res.status_code == 200
    today_status = res.json()
    assert today_status["has_clocked_in"] is False
    assert today_status["has_clocked_out"] is False
    assert today_status["is_on_break"] is False

    # 2. Clock In
    res = await client.post(
        "/api/v1/attendance/punch",
        json={"action": "clock_in", "notes": "Morning arrival"},
        headers=headers,
    )
    assert res.status_code == 200, res.text
    punch_data = res.json()
    assert punch_data["user_id"] == str(cashier_user.id)
    assert punch_data["clock_in"] is not None
    assert punch_data["status"] in ("present", "late")

    # 3. Duplicate Clock In should fail with 400
    res = await client.post(
        "/api/v1/attendance/punch",
        json={"action": "clock_in"},
        headers=headers,
    )
    assert res.status_code == 400
    assert "Already clocked in" in res.json()["detail"]

    # 4. Start Break
    res = await client.post(
        "/api/v1/attendance/punch",
        json={"action": "break_start", "break_type": "tea", "notes": "Tea break"},
        headers=headers,
    )
    assert res.status_code == 200
    break_start_data = res.json()
    assert break_start_data["is_on_break"] is True
    assert break_start_data["current_break_type"] == "tea"
    assert len(break_start_data["breaks"]) == 1

    # 5. Starting break while already on break should fail
    res = await client.post(
        "/api/v1/attendance/punch",
        json={"action": "break_start", "break_type": "lunch"},
        headers=headers,
    )
    assert res.status_code == 400
    assert "Already on break" in res.json()["detail"]

    # 6. End Break
    res = await client.post(
        "/api/v1/attendance/punch",
        json={"action": "break_end"},
        headers=headers,
    )
    assert res.status_code == 200
    break_end_data = res.json()
    assert break_end_data["is_on_break"] is False
    assert break_end_data["current_break_type"] is None
    assert len(break_end_data["breaks"]) == 1
    assert break_end_data["breaks"][0]["end_time"] is not None

    # 7. Check /today while clocked in
    res = await client.get("/api/v1/attendance/today", headers=headers)
    assert res.status_code == 200
    today_status = res.json()
    assert today_status["has_clocked_in"] is True
    assert today_status["has_clocked_out"] is False
    assert today_status["is_on_break"] is False

    # 8. Clock Out
    res = await client.post(
        "/api/v1/attendance/punch",
        json={"action": "clock_out", "notes": "Till handover complete"},
        headers=headers,
    )
    assert res.status_code == 200, res.text
    out_data = res.json()
    assert out_data["clock_out"] is not None
    assert out_data["total_work_minutes"] >= 0

    # 9. Clock out again should fail
    res = await client.post(
        "/api/v1/attendance/punch",
        json={"action": "clock_out"},
        headers=headers,
    )
    assert res.status_code == 400
    assert "Already clocked out" in res.json()["detail"]


async def test_punch_break_without_clock_in_fails(client: AsyncClient, cashier_user: User):
    token = await _login(client, cashier_user.email, "cashierpass123")
    headers = {"Authorization": f"Bearer {token}"}

    res = await client.post(
        "/api/v1/attendance/punch",
        json={"action": "break_start", "break_type": "tea"},
        headers=headers,
    )
    assert res.status_code == 400
    assert "before clocking in" in res.json()["detail"]


async def test_attendance_my_history(client: AsyncClient, cashier_user: User):
    token = await _login(client, cashier_user.email, "cashierpass123")
    headers = {"Authorization": f"Bearer {token}"}

    # Clock in
    await client.post(
        "/api/v1/attendance/punch",
        json={"action": "clock_in"},
        headers=headers,
    )

    res = await client.get("/api/v1/attendance/my-history", headers=headers)
    assert res.status_code == 200
    history = res.json()
    assert isinstance(history, list)
    assert len(history) >= 1
    assert history[0]["user_id"] == str(cashier_user.id)


async def test_manager_live_roster_and_summary_access(
    client: AsyncClient,
    cashier_user: User,
    manager_user: User,
):
    cashier_token = await _login(client, cashier_user.email, "cashierpass123")
    manager_token = await _login(client, manager_user.email, "managerpass123")

    # Cashier cannot access live-roster or summary (403)
    res = await client.get(
        "/api/v1/attendance/live-roster",
        headers={"Authorization": f"Bearer {cashier_token}"},
    )
    assert res.status_code == 403

    res = await client.get(
        "/api/v1/attendance/summary",
        headers={"Authorization": f"Bearer {cashier_token}"},
    )
    assert res.status_code == 403

    # Cashier clocks in
    await client.post(
        "/api/v1/attendance/punch",
        json={"action": "clock_in"},
        headers={"Authorization": f"Bearer {cashier_token}"},
    )

    # Manager CAN access live-roster and sees the clocked-in cashier
    res = await client.get(
        "/api/v1/attendance/live-roster",
        headers={"Authorization": f"Bearer {manager_token}"},
    )
    assert res.status_code == 200
    roster = res.json()
    assert any(item["user_id"] == str(cashier_user.id) for item in roster)

    # Manager CAN access summary
    res = await client.get(
        "/api/v1/attendance/summary",
        headers={"Authorization": f"Bearer {manager_token}"},
    )
    assert res.status_code == 200
    summary = res.json()
    assert summary["present_count"] >= 1


async def test_store_network_ip_restriction(client: AsyncClient, cashier_user: User):
    token = await _login(client, cashier_user.email, "cashierpass123")
    headers = {"Authorization": f"Bearer {token}"}

    # Turn on enforce_store_ip with allowed list
    settings = await StoreSettings.find_one()
    if not settings:
        settings = StoreSettings()
        await settings.insert()

    settings.attendance_config.enforce_store_ip = True
    settings.attendance_config.allowed_ips = ["192.168.1.100", "192.168.1.101"]
    await settings.save()

    try:
        # Request with disallowed IP should be 403
        headers_disallowed = {**headers, "X-Forwarded-For": "10.0.0.99"}
        res = await client.post(
            "/api/v1/attendance/punch",
            json={"action": "clock_in"},
            headers=headers_disallowed,
        )
        assert res.status_code == 403
        assert "restricted to store Wi-Fi" in res.json()["detail"]

        # Request with allowed IP should succeed
        headers_allowed = {**headers, "X-Forwarded-For": "192.168.1.100"}
        res = await client.post(
            "/api/v1/attendance/punch",
            json={"action": "clock_in"},
            headers=headers_allowed,
        )
        assert res.status_code == 200
    finally:
        # Reset setting
        settings.attendance_config.enforce_store_ip = False
        settings.attendance_config.allowed_ips = []
        await settings.save()
