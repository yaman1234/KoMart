"""Store settings API tests."""

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.database import init_db
from app.models.user import User, UserRole
from app.models.settings import StoreSettings
from app.auth.jwt import hash_password


@pytest.fixture(autouse=True)
async def setup_db():
    await init_db()


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.fixture
async def admin_user():
    email = "settings-admin@komart.com"
    existing = await User.find_one(User.email == email)
    if existing:
        await existing.delete()
    user = User(
        email=email,
        name="Settings Admin",
        hashed_password=hash_password("adminpass123"),
        role=UserRole.admin,
        is_active=True,
    )
    await user.insert()
    yield user
    await user.delete()


@pytest.fixture
async def cashier_user():
    email = "settings-cashier@komart.com"
    existing = await User.find_one(User.email == email)
    if existing:
        await existing.delete()
    user = User(
        email=email,
        name="Settings Cashier",
        hashed_password=hash_password("cashierpass123"),
        role=UserRole.cashier,
        is_active=True,
    )
    await user.insert()
    yield user
    await user.delete()


async def _login(client: AsyncClient, email: str, password: str) -> str:
    res = await client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert res.status_code == 200
    return res.json()["access_token"]


@pytest.mark.asyncio
async def test_get_settings_includes_extended_fields(
    client: AsyncClient,
    cashier_user: User,
):
    token = await _login(client, cashier_user.email, "cashierpass123")
    res = await client.get(
        "/api/v1/settings",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["storeName"]
    assert "receiptHeader" in body
    assert "autoPrint" in body
    assert "defaultLowStockThreshold" in body
    assert "transactionPrefix" in body
    assert "expiryWarningDays" in body


@pytest.mark.asyncio
async def test_patch_settings_requires_admin(
    client: AsyncClient,
    cashier_user: User,
    admin_user: User,
):
    cashier_token = await _login(client, cashier_user.email, "cashierpass123")
    denied = await client.patch(
        "/api/v1/settings",
        json={"storeName": "Hacked"},
        headers={"Authorization": f"Bearer {cashier_token}"},
    )
    assert denied.status_code == 403

    admin_token = await _login(client, admin_user.email, "adminpass123")
    res = await client.patch(
        "/api/v1/settings",
        json={
            "storeName": "KoMart Test",
            "receiptFooter": "Visit again!",
            "autoPrint": True,
            "defaultPaymentMethod": "esewa",
            "defaultLowStockThreshold": 15,
            "expiryWarningDays": 45,
            "transactionPrefix": "sale",
            "purchaseOrderPrefix": "ord",
        },
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert res.status_code == 200

    get_res = await client.get(
        "/api/v1/settings",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    body = get_res.json()
    assert body["storeName"] == "KoMart Test"
    assert body["receiptFooter"] == "Visit again!"
    assert body["autoPrint"] is True
    assert body["defaultPaymentMethod"] == "esewa"
    assert body["defaultLowStockThreshold"] == 15
    assert body["expiryWarningDays"] == 45
    assert body["transactionPrefix"] == "SALE"
    assert body["purchaseOrderPrefix"] == "ORD"


@pytest.mark.asyncio
async def test_store_settings_helper_creates_defaults():
    existing = await StoreSettings.find_all().to_list()
    for row in existing:
        await row.delete()

    from app.services.store_settings import get_store_settings, settings_to_api

    settings = await get_store_settings()
    api = settings_to_api(settings)
    assert api["transactionPrefix"] == "TXN"
    assert api["expiryWarningDays"] == 30
