"""Supplier payment details round-trip and validation."""

from __future__ import annotations

import uuid

import pytest
from httpx import ASGITransport, AsyncClient

from app.auth.jwt import hash_password
from app.database import init_db
from app.main import app
from app.models.supplier import Supplier
from app.models.user import User, UserRole


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
    email = f"sup-pay-{uuid.uuid4().hex[:8]}@komart.com"
    user = User(
        email=email,
        name="Supplier Payment Tester",
        hashed_password=hash_password("managerpass123"),
        role=UserRole.manager,
        is_active=True,
    )
    await user.insert()
    yield user
    await user.delete()


async def _login(client: AsyncClient, email: str, password: str) -> str:
    res = await client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert res.status_code == 200
    return res.json()["access_token"]


def _supplier_body(**extra) -> dict:
    body = {
        "name": f"Pay Supplier {uuid.uuid4().hex[:6]}",
        "country": "Nepal",
        "contact_person": "Asha",
        "phone": "9800000000",
        "email": "pay@example.com",
        "address": "Kathmandu",
    }
    body.update(extra)
    return body


@pytest.mark.asyncio
async def test_payment_details_roundtrip_and_legacy_doc(client: AsyncClient, manager_user: User):
    token = await _login(client, manager_user.email, "managerpass123")
    headers = {"Authorization": f"Bearer {token}"}
    qr = "https://res.cloudinary.com/demo/image/upload/supplier-qr.png"
    created = await client.post(
        "/api/v1/suppliers",
        headers=headers,
        json=_supplier_body(
            payment_details=[
                {
                    "method": "Esewa",
                    "label": "  Store wallet  ",
                    "account_name": "Seoul Foods",
                    "account_number": "9801234567",
                    "qr_image_url": qr,
                },
                {
                    "method": "bank",
                    "account_name": "Seoul Foods Import",
                    "account_number": "0123456789",
                    "bank_name": "Nabil Bank",
                    "qr_image_url": "",
                },
            ]
        ),
    )
    assert created.status_code == 201, created.text
    body = created.json()
    supplier_id = body["id"]
    details = body["payment_details"]
    assert details[0]["method"] == "esewa"
    assert details[0]["label"] == "Store wallet"
    assert details[0]["qr_image_url"] == qr
    assert details[1]["method"] == "bank"
    assert details[1]["bank_name"] == "Nabil Bank"
    assert details[1]["qr_image_url"] is None

    fetched = await client.get(f"/api/v1/suppliers/{supplier_id}", headers=headers)
    assert fetched.status_code == 200, fetched.text
    assert fetched.json()["payment_details"] == details

    updated = await client.patch(
        f"/api/v1/suppliers/{supplier_id}",
        headers=headers,
        json={
            "payment_details": [
                {
                    "method": "khalti",
                    "label": "Khalti",
                    "qr_image_url": "https://cdn.example.com/khalti.png",
                }
            ]
        },
    )
    assert updated.status_code == 200, updated.text
    updated_details = updated.json()["payment_details"]
    assert len(updated_details) == 1
    assert updated_details[0]["method"] == "khalti"
    assert updated_details[0]["qr_image_url"] == "https://cdn.example.com/khalti.png"

    again = await client.get(f"/api/v1/suppliers/{supplier_id}", headers=headers)
    assert again.json()["payment_details"] == updated_details

    legacy = Supplier(
        name=f"Legacy {uuid.uuid4().hex[:6]}",
        country="Nepal",
        contact_person="Old",
        phone="9801111111",
        address="Pokhara",
    )
    await legacy.insert()
    legacy_id = str(legacy.id)
    try:
        await Supplier.get_motor_collection().update_one(
            {"_id": legacy.id},
            {"$unset": {"payment_details": ""}},
        )
        legacy_get = await client.get(f"/api/v1/suppliers/{legacy_id}", headers=headers)
        assert legacy_get.status_code == 200, legacy_get.text
        assert legacy_get.json()["payment_details"] == []
    finally:
        await Supplier.get_motor_collection().delete_many(
            {"_id": {"$in": [legacy.id]}}
        )
        stored = await Supplier.get(supplier_id)
        if stored:
            await stored.delete()


@pytest.mark.asyncio
async def test_payment_details_validation(client: AsyncClient, manager_user: User):
    token = await _login(client, manager_user.email, "managerpass123")
    headers = {"Authorization": f"Bearer {token}"}

    too_many = await client.post(
        "/api/v1/suppliers",
        headers=headers,
        json=_supplier_body(
            payment_details=[{"method": "esewa", "label": str(i)} for i in range(11)]
        ),
    )
    assert too_many.status_code == 422, too_many.text

    bad_method = await client.post(
        "/api/v1/suppliers",
        headers=headers,
        json=_supplier_body(payment_details=[{"method": "paypal"}]),
    )
    assert bad_method.status_code == 422, bad_method.text

    bad_url = await client.post(
        "/api/v1/suppliers",
        headers=headers,
        json=_supplier_body(
            payment_details=[{"method": "fonepay", "qr_image_url": "javascript:alert(1)"}]
        ),
    )
    assert bad_url.status_code == 422, bad_url.text

    http_url = await client.post(
        "/api/v1/suppliers",
        headers=headers,
        json=_supplier_body(
            payment_details=[{"method": "esewa", "qr_image_url": "http://cdn.example.com/qr.png"}]
        ),
    )
    assert http_url.status_code == 422, http_url.text

    long_label = await client.post(
        "/api/v1/suppliers",
        headers=headers,
        json=_supplier_body(payment_details=[{"method": "other", "label": "x" * 81}]),
    )
    assert long_label.status_code == 422, long_label.text

    omitted = await client.post("/api/v1/suppliers", headers=headers, json=_supplier_body())
    assert omitted.status_code == 201, omitted.text
    assert omitted.json()["payment_details"] == []
    stored = await Supplier.get(omitted.json()["id"])
    if stored:
        await stored.delete()
