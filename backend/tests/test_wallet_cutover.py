"""Admin balance cutover: set Bank, eSewa, and till cash to statement amounts."""

from __future__ import annotations

import uuid

import pytest
from fastapi import HTTPException
from httpx import ASGITransport, AsyncClient

from app.auth.jwt import hash_password
from app.database import init_db
from app.main import app
from app.models.audit_log import AuditLog
from app.models.cash_custody import CashCustody
from app.models.user import User, UserRole
from app.models.wallet_ledger import Wallet, WalletDirection, WalletEntryType, WalletLedgerEntry
from app.services import wallet_ledger as wl
from app.services.time_nepal import today_npt


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
    email = f"cutover-admin-{uuid.uuid4().hex[:8]}@komart.com"
    user = User(
        email=email,
        name=f"Cutover Admin {uuid.uuid4().hex[:8]}",
        hashed_password=hash_password("adminpass123"),
        role=UserRole.admin,
        is_active=True,
    )
    await user.insert()
    yield user
    await user.delete()


@pytest.fixture
async def manager_user():
    email = f"cutover-mgr-{uuid.uuid4().hex[:8]}@komart.com"
    user = User(
        email=email,
        name=f"Cutover Manager {uuid.uuid4().hex[:8]}",
        hashed_password=hash_password("managerpass123"),
        role=UserRole.manager,
        is_active=True,
    )
    await user.insert()
    yield user
    await user.delete()


async def _login(client: AsyncClient, email: str, password: str) -> str:
    res = await client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert res.status_code == 200, res.text
    return res.json()["access_token"]


async def _cleanup(name: str) -> None:
    await WalletLedgerEntry.find(WalletLedgerEntry.created_by == name).delete()
    await CashCustody.find(CashCustody.created_by == name).delete()
    await AuditLog.find(AuditLog.user_name == name, AuditLog.action == "balance_cutover").delete()


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.asyncio
async def test_manager_cannot_set_balances(client: AsyncClient, manager_user: User):
    token = await _login(client, manager_user.email, "managerpass123")
    res = await client.post(
        "/api/v1/wallets/cutover",
        headers=_auth(token),
        json={"bank": 1},
    )
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_cutover_posts_outflow_and_skips_blank_wallet(
    client: AsyncClient,
    admin_user: User,
):
    token = await _login(client, admin_user.email, "adminpass123")
    today = today_npt().isoformat()
    name = admin_user.name
    try:
        bank_before = await wl.current_wallet_balance(Wallet.bank)
        esewa_before = await wl.current_wallet_balance(Wallet.esewa)
        totals_before = await wl.day_totals(Wallet.bank, today)
        bring_to_statement = round(125000 - bank_before, 2)
        if abs(bring_to_statement) >= 0.01:
            await wl.post_entry(
                wallet=Wallet.bank,
                direction=WalletDirection.inflow if bring_to_statement > 0 else WalletDirection.outflow,
                amount=abs(bring_to_statement),
                entry_type=WalletEntryType.sale,
                date=today,
                remarks="cutover fixture sale",
                created_by=name,
            )
        assert await wl.current_wallet_balance(Wallet.bank) == 125000

        target = 80000.0
        res = await client.post(
            "/api/v1/wallets/cutover",
            headers=_auth(token),
            json={"bank": target},
        )
        assert res.status_code == 200, res.text
        body = res.json()
        assert body["date"] == today
        assert [line["wallet"] for line in body["lines"]] == ["bank"]
        line = body["lines"][0]
        assert line["delta"] == -45000
        assert line["skipped"] is False
        assert await wl.current_wallet_balance(Wallet.bank) == target
        assert await wl.current_wallet_balance(Wallet.esewa) == esewa_before

        entry = await WalletLedgerEntry.get(line["entry_id"])
        assert entry is not None
        assert entry.entry_type == WalletEntryType.opening
        assert entry.direction == WalletDirection.outflow
        assert float(entry.amount) == 45000
        assert entry.reference_type == wl.BALANCE_CUTOVER_REF
        assert entry.reference_id == "bank"
        assert entry.remarks == f"Balance cutover as of {today}"

        totals_after = await wl.day_totals(Wallet.bank, today)
        assert totals_after["cutover_out"] == round(totals_before["cutover_out"] + 45000, 2)

        audit = await AuditLog.find_one(AuditLog.user_name == name, AuditLog.action == "balance_cutover")
        assert audit is not None
        assert audit.new_value.get("bank_target") == target
        assert audit.new_value.get("bank_delta") == -45000
    finally:
        await _cleanup(name)


@pytest.mark.asyncio
async def test_cash_cutover_leaves_staff_custody_unchanged(
    client: AsyncClient,
    admin_user: User,
):
    token = await _login(client, admin_user.email, "adminpass123")
    today = today_npt().isoformat()
    name = admin_user.name
    custody = CashCustody(
        amount=2000,
        held_by_user_id="cutover-holder",
        held_by_name="Cutover Holder",
        taken_date=today,
        remarks="cutover fixture",
        created_by=name,
    )
    await custody.insert()
    try:
        staff_before = await wl.open_custody_total()
        target = 500.0
        res = await client.post(
            "/api/v1/wallets/cutover",
            headers=_auth(token),
            json={"cash": target},
        )
        assert res.status_code == 200, res.text
        assert await wl.current_wallet_balance(Wallet.cash) == target
        assert await wl.open_custody_total() == staff_before
        balances = res.json()["balances"]
        assert balances["cash_with_staff"] == staff_before
        assert balances["cash"] == round(target + staff_before, 2)
    finally:
        await _cleanup(name)


@pytest.mark.asyncio
async def test_second_cutover_rejected_without_replace_and_posts_nothing_else(
    client: AsyncClient,
    admin_user: User,
):
    token = await _login(client, admin_user.email, "adminpass123")
    name = admin_user.name
    try:
        esewa_before = await wl.current_wallet_balance(Wallet.esewa)
        first_target = 1000.0
        first = await client.post(
            "/api/v1/wallets/cutover",
            headers=_auth(token),
            json={"bank": first_target},
        )
        assert first.status_code == 200, first.text

        second = await client.post(
            "/api/v1/wallets/cutover",
            headers=_auth(token),
            json={"bank": 2000, "esewa": round(esewa_before + 5, 2) if esewa_before >= 0 else 5},
        )
        assert second.status_code == 409
        assert "already exists" in second.json()["detail"]
        assert await wl.current_wallet_balance(Wallet.bank) == first_target
        assert await wl.current_wallet_balance(Wallet.esewa) == esewa_before
    finally:
        await _cleanup(name)


@pytest.mark.asyncio
async def test_replace_blocked_after_later_activity(client: AsyncClient, admin_user: User):
    token = await _login(client, admin_user.email, "adminpass123")
    today = today_npt().isoformat()
    name = admin_user.name
    try:
        first_target = 1000.0
        first = await client.post(
            "/api/v1/wallets/cutover",
            headers=_auth(token),
            json={"bank": first_target},
        )
        assert first.status_code == 200, first.text
        await wl.post_entry(
            wallet=Wallet.bank,
            direction=WalletDirection.inflow,
            amount=5,
            entry_type=WalletEntryType.sale,
            date=today,
            remarks="activity after cutover",
            created_by=name,
        )
        replaced = await client.post(
            "/api/v1/wallets/cutover",
            headers=_auth(token),
            json={"bank": 2000, "replace": True},
        )
        assert replaced.status_code == 409
        assert "activity after the cutover" in replaced.json()["detail"]
        assert await wl.current_wallet_balance(Wallet.bank) == round(first_target + 5, 2)
    finally:
        await _cleanup(name)


@pytest.mark.asyncio
async def test_replace_before_later_activity(client: AsyncClient, admin_user: User):
    token = await _login(client, admin_user.email, "adminpass123")
    name = admin_user.name
    try:
        esewa_before = await wl.current_wallet_balance(Wallet.esewa)
        first = await client.post(
            "/api/v1/wallets/cutover",
            headers=_auth(token),
            json={"esewa": round(esewa_before + 10, 2)},
        )
        assert first.status_code == 200, first.text
        new_target = round(esewa_before + 25, 2)
        replaced = await client.post(
            "/api/v1/wallets/cutover",
            headers=_auth(token),
            json={"esewa": new_target, "replace": True},
        )
        assert replaced.status_code == 200, replaced.text
        line = replaced.json()["lines"][0]
        assert line["delta"] == 15
        assert await wl.current_wallet_balance(Wallet.esewa) == new_target
        rows = await wl.find_by_reference(wl.BALANCE_CUTOVER_REF, "esewa")
        ours = [row for row in rows if row.created_by == name]
        assert len(ours) == 2
    finally:
        await _cleanup(name)


@pytest.mark.asyncio
async def test_cutover_rejected_when_day_close_variance_exists(
    client: AsyncClient,
    admin_user: User,
):
    token = await _login(client, admin_user.email, "adminpass123")
    today = today_npt().isoformat()
    name = admin_user.name
    try:
        bank_before = await wl.current_wallet_balance(Wallet.bank)
        await wl.post_entry(
            wallet=Wallet.bank,
            direction=WalletDirection.outflow,
            amount=1,
            entry_type=WalletEntryType.adjustment,
            date=today,
            remarks="day close variance fixture",
            reference_type=wl.DAY_CLOSE_VARIANCE_REF,
            reference_id=wl.day_close_variance_ref_id(today, "bank"),
            created_by=name,
        )
        res = await client.post(
            "/api/v1/wallets/cutover",
            headers=_auth(token),
            json={"bank": 1000},
        )
        assert res.status_code == 409
        assert "variance" in res.json()["detail"].lower()
        assert await wl.current_wallet_balance(Wallet.bank) == round(bank_before - 1, 2)
    finally:
        await _cleanup(name)


@pytest.mark.asyncio
async def test_day_close_variance_rejected_after_cutover(client: AsyncClient, admin_user: User):
    token = await _login(client, admin_user.email, "adminpass123")
    today = today_npt().isoformat()
    name = admin_user.name
    try:
        esewa_before = await wl.current_wallet_balance(Wallet.esewa)
        res = await client.post(
            "/api/v1/wallets/cutover",
            headers=_auth(token),
            json={"esewa": round(esewa_before + 3, 2)},
        )
        assert res.status_code == 200, res.text
        with pytest.raises(HTTPException) as exc:
            await wl.post_day_close_variance(day=today, wallet="esewa", created_by=name)
        assert exc.value.status_code == 409
        assert "cutover" in str(exc.value.detail).lower()
    finally:
        await _cleanup(name)


@pytest.mark.asyncio
async def test_matching_target_is_skipped(client: AsyncClient, admin_user: User):
    token = await _login(client, admin_user.email, "adminpass123")
    name = admin_user.name
    try:
        esewa_before = await wl.current_wallet_balance(Wallet.esewa)
        target = esewa_before if esewa_before >= 0 else 4000.0
        if target != esewa_before:
            first = await client.post(
                "/api/v1/wallets/cutover",
                headers=_auth(token),
                json={"esewa": target},
            )
            assert first.status_code == 200, first.text
        res = await client.post(
            "/api/v1/wallets/cutover",
            headers=_auth(token),
            json={"esewa": target},
        )
        assert res.status_code == 200, res.text
        line = res.json()["lines"][0]
        assert line["skipped"] is True
        assert line["entry_id"] is None
        assert await wl.current_wallet_balance(Wallet.esewa) == target
        audits = await AuditLog.find(
            AuditLog.user_name == name,
            AuditLog.action == "balance_cutover",
        ).to_list()
        assert len(audits) == (0 if target == esewa_before else 1)
    finally:
        await _cleanup(name)
