"""Tests for Daily Operational Checklists & Templates API."""

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.database import init_db
from app.models.user import User, UserRole
from app.models.checklist import (
    ChecklistTemplate,
    DailyChecklist,
    ChecklistStatus,
    TargetRole,
    ChecklistCategory,
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
    email = "checklist-mgr@komart.com"
    existing = await User.find_one(User.email == email)
    if existing:
        await existing.delete()
    user = User(
        email=email,
        name="Checklist Manager",
        hashed_password=hash_password("mgrpass123"),
        role=UserRole.manager,
        is_active=True,
    )
    await user.insert()
    yield user
    await user.delete()


@pytest.fixture
async def cashier_user():
    email = "checklist-cashier@komart.com"
    existing = await User.find_one(User.email == email)
    if existing:
        await existing.delete()
    user = User(
        email=email,
        name="Checklist Cashier",
        hashed_password=hash_password("cashierpass123"),
        role=UserRole.cashier,
        is_active=True,
    )
    await user.insert()
    yield user
    await user.delete()


@pytest.fixture
async def admin_user():
    email = "checklist-admin@komart.com"
    existing = await User.find_one(User.email == email)
    if existing:
        await existing.delete()
    user = User(
        email=email,
        name="Checklist Admin",
        hashed_password=hash_password("adminpass123"),
        role=UserRole.admin,
        is_active=True,
    )
    await user.insert()
    yield user
    await user.delete()


async def get_token(client: AsyncClient, email: str, password: str) -> str:
    res = await client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert res.status_code == 200, res.text
    return res.json()["access_token"]


@pytest.mark.asyncio
async def test_list_and_create_template(client, manager_user):
    token = await get_token(client, manager_user.email, "mgrpass123")
    headers = {"Authorization": f"Bearer {token}"}

    # 1. List templates
    res = await client.get("/api/v1/checklists/templates", headers=headers)
    assert res.status_code == 200
    templates = res.json()
    assert isinstance(templates, list)

    # 2. Create template
    payload = {
        "title": "Chilled Display Inspection",
        "description": "Daily morning beverage and fresh food temperature check",
        "category": "opening",
        "target_role": "all",
        "items": [
            {
                "id": "c1",
                "title": "Check display fridge temperature",
                "is_mandatory": True,
                "order": 1,
                "requires_numeric_input": True,
                "numeric_unit": "°C",
            },
            {
                "id": "c2",
                "title": "Restock drinks from walk-in cold room",
                "is_mandatory": False,
                "order": 2,
            },
        ],
        "is_active": True,
        "auto_generate_daily": True,
        "days_of_week": [0, 1, 2, 3, 4, 5, 6],
    }
    res = await client.post("/api/v1/checklists/templates", headers=headers, json=payload)
    assert res.status_code == 201
    created = res.json()
    assert created["title"] == "Chilled Display Inspection"
    assert len(created["items"]) == 2
    assert created["items"][0]["requires_numeric_input"] is True

    # Cleanup template
    await ChecklistTemplate.find_one(ChecklistTemplate.title == "Chilled Display Inspection").delete()


@pytest.mark.asyncio
async def test_my_today_checklists_and_toggle(client, cashier_user):
    token = await get_token(client, cashier_user.email, "cashierpass123")
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Get my today checklists (auto-generates if not already generated)
    res = await client.get("/api/v1/checklists/my-today", headers=headers)
    assert res.status_code == 200
    today_checklists = res.json()
    assert len(today_checklists) > 0

    first_checklist = today_checklists[0]
    checklist_id = first_checklist["id"]
    item_to_toggle = first_checklist["items"][0]
    item_id = item_to_toggle["id"]

    # 2. Toggle item to completed
    res = await client.patch(
        f"/api/v1/checklists/{checklist_id}/items/{item_id}",
        headers=headers,
        json={"is_completed": True, "notes": "Completed smoothly", "numeric_input": 4.5},
    )
    assert res.status_code == 200
    updated = res.json()
    assert updated["completed_items_count"] >= 1
    assert updated["completion_rate"] > 0
    toggled_item = next(it for it in updated["items"] if it["id"] == item_id)
    assert toggled_item["is_completed"] is True
    assert toggled_item["completed_by_name"] == "Checklist Cashier"
    assert toggled_item["numeric_input"] == 4.5
    assert toggled_item["notes"] == "Completed smoothly"

    # 3. Toggle back to incomplete
    res = await client.patch(
        f"/api/v1/checklists/{checklist_id}/items/{item_id}",
        headers=headers,
        json={"is_completed": False},
    )
    assert res.status_code == 200
    untoggled = res.json()
    toggled_item2 = next(it for it in untoggled["items"] if it["id"] == item_id)
    assert toggled_item2["is_completed"] is False


@pytest.mark.asyncio
async def test_manager_overview_and_verify(client, manager_user):
    token = await get_token(client, manager_user.email, "mgrpass123")
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Get overview
    res = await client.get("/api/v1/checklists/overview", headers=headers)
    assert res.status_code == 200
    overview_list = res.json()
    assert len(overview_list) > 0

    target = overview_list[0]
    target_id = target["id"]

    # 2. Verify / sign-off on checklist
    res = await client.post(
        f"/api/v1/checklists/{target_id}/verify",
        headers=headers,
        json={"remarks": "Verified opening routine by Shift Manager"},
    )
    assert res.status_code == 200
    verified = res.json()
    assert verified["verified_by_name"] == "Checklist Manager"
    assert verified["manager_remarks"] == "Verified opening routine by Shift Manager"


@pytest.mark.asyncio
async def test_update_and_deactivate_template(client, manager_user, admin_user):
    mgr_token = await get_token(client, manager_user.email, "mgrpass123")
    admin_token = await get_token(client, admin_user.email, "adminpass123")

    mgr_headers = {"Authorization": f"Bearer {mgr_token}"}
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    # Create temporary template
    t = ChecklistTemplate(
        title="Temp Deactivate Test",
        category=ChecklistCategory.general,
        target_role=TargetRole.all,
        items=[],
        is_active=True,
        created_by=str(manager_user.id),
        created_by_name=manager_user.name,
    )
    await t.insert()
    temp_id = str(t.id)

    # 1. Update template
    res = await client.patch(
        f"/api/v1/checklists/templates/{temp_id}",
        headers=mgr_headers,
        json={"title": "Updated Temp Title", "description": "New description"},
    )
    assert res.status_code == 200
    assert res.json()["title"] == "Updated Temp Title"

    # 2. Manager deletes template
    res = await client.delete(f"/api/v1/checklists/templates/{temp_id}", headers=mgr_headers)
    assert res.status_code == 200


@pytest.mark.asyncio
async def test_delete_daily_checklist(client, manager_user):
    token = await get_token(client, manager_user.email, "mgrpass123")
    headers = {"Authorization": f"Bearer {token}"}

    # Create daily checklist
    today_date = get_today_npt_date_str()
    d = DailyChecklist(
        title="Checklist to Delete",
        category=ChecklistCategory.general,
        date=today_date,
        target_role=TargetRole.cashier,
        assigned_by_user_id=str(manager_user.id),
        assigned_by_user_name=manager_user.name,
        items=[],
    )
    await d.insert()
    d_id = str(d.id)

    # Delete daily checklist
    res = await client.delete(f"/api/v1/checklists/{d_id}", headers=headers)
    assert res.status_code == 200
    assert "deleted successfully" in res.json()["message"]

    # Verify 404 on subsequent get/delete
    check_exists = await DailyChecklist.get(d_id)
    assert check_exists is None


@pytest.mark.asyncio
async def test_generate_daily_checklists(client, manager_user):
    token = await get_token(client, manager_user.email, "mgrpass123")
    headers = {"Authorization": f"Bearer {token}"}

    res = await client.post("/api/v1/checklists/generate-daily", headers=headers)
    assert res.status_code == 200
    checklists = res.json()
    assert isinstance(checklists, list)
    assert len(checklists) > 0

