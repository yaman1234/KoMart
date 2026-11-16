"""Inventory ledger invariant, void/edit diary, and integrity/align."""

from __future__ import annotations

import uuid

import pytest
from fastapi import HTTPException
from httpx import ASGITransport, AsyncClient

from app.auth.jwt import hash_password
from app.database import init_db
from app.main import app
from app.models.inventory import AdjustmentType, InventoryBatch, StockAdjustment
from app.models.product import Product, ProductStatus
from app.models.transaction import PaymentMethod
from app.models.user import User, UserRole
from app.schemas.transaction import TransactionCreate, TransactionItem, TransactionUpdate
from app.services.inventory_movements import (
    align_ledger_to_on_hand,
    count_out_of_sync_skus,
    list_integrity_rows,
    product_integrity,
)
from app.services.sales import record_sale, update_transaction, void_sale
from app.services.stock import adjust_stock, get_current_stock, receive_stock


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
    email = f"integrity-admin-{uuid.uuid4().hex[:8]}@komart.com"
    user = User(
        email=email,
        name="Integrity Admin",
        hashed_password=hash_password("adminpass123"),
        role=UserRole.admin,
        is_active=True,
    )
    await user.insert()
    yield user
    await user.delete()


@pytest.fixture
async def manager_user():
    email = f"integrity-mgr-{uuid.uuid4().hex[:8]}@komart.com"
    user = User(
        email=email,
        name="Integrity Manager",
        hashed_password=hash_password("managerpass123"),
        role=UserRole.manager,
        is_active=True,
    )
    await user.insert()
    yield user
    await user.delete()


async def _product(sku: str) -> Product:
    product = Product(
        name=f"Integrity {sku}",
        sku=sku,
        barcode=sku,
        brand="Test",
        country_of_origin="Nepal",
        category="Snacks",
        supplier_id="sup-1",
        supplier_name="Supplier",
        cost_price=10.0,
        selling_price=20.0,
        low_stock_threshold=1,
        status=ProductStatus.active,
        is_active=True,
    )
    await product.insert()
    return product


def _sale_body(product_id: str, qty: int, created_by: str = "test"):
    return TransactionCreate(
        items=[
            TransactionItem(
                product_id=product_id,
                name="Test",
                sku="TEST",
                price=20.0,
                quantity=qty,
                discount=0.0,
            )
        ],
        subtotal=20.0 * qty,
        discount=0.0,
        tax=0.0,
        total=20.0 * qty,
        payment_method=PaymentMethod.cash,
        created_by=created_by,
    )


async def _login(client: AsyncClient, email: str, password: str) -> str:
    res = await client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert res.status_code == 200
    return res.json()["access_token"]


async def _cleanup(pid: str, product: Product):
    for leftover in await InventoryBatch.find(InventoryBatch.product_id == pid).to_list():
        await leftover.delete()
    for leftover in await StockAdjustment.find(StockAdjustment.product_id == pid).to_list():
        await leftover.delete()
    await product.delete()


async def _assert_book_matches_shelf(product_id: str) -> None:
    integrity = await product_integrity(product_id)
    assert integrity["on_hand"] == await get_current_stock(product_id)
    assert integrity["variance"] == 0
    assert integrity["ledger_close"] == integrity["on_hand"]


@pytest.mark.asyncio
async def test_receive_and_adjust_keep_ledger_equal_to_on_hand():
    product = await _product(f"INV-{uuid.uuid4().hex[:6]}")
    pid = str(product.id)
    try:
        await receive_stock(pid, "IN-A", 10, unit_cost=10.0, created_by="test")
        await _assert_book_matches_shelf(pid)
        last = (
            await StockAdjustment.find(StockAdjustment.product_id == pid)
            .sort("-created_at")
            .first_or_none()
        )
        assert last is not None
        assert last.quantity == 10
        assert last.stock_after == last.stock_before + last.quantity

        await adjust_stock(pid, -3, AdjustmentType.correction, "count", "test")
        await _assert_book_matches_shelf(pid)
    finally:
        await _cleanup(pid, product)


@pytest.mark.asyncio
async def test_sale_multi_batch_logs_actual_allocations():
    product = await _product(f"FEFO-{uuid.uuid4().hex[:6]}")
    pid = str(product.id)
    try:
        await receive_stock(pid, "OLD", 3, unit_cost=8.0, expiry_date="2026-01-01", created_by="test")
        await receive_stock(pid, "NEW", 5, unit_cost=9.0, expiry_date="2027-01-01", created_by="test")
        txn = await record_sale(
            _sale_body(pid, 4),
            cashier_id="c1",
            apply_loyalty=False,
            skip_server_pricing=True,
        )
        assert await get_current_stock(pid) == 4
        await _assert_book_matches_shelf(pid)
        sales = (
            await StockAdjustment.find(
                StockAdjustment.product_id == pid,
                StockAdjustment.type == AdjustmentType.sale,
            )
            .sort("+created_at")
            .to_list()
        )
        assert sum(abs(row.quantity) for row in sales) == 4
        assert sales[-1].stock_after == 4
        assert len(txn.items[0].batch_allocations) >= 2
    finally:
        await _cleanup(pid, product)


@pytest.mark.asyncio
async def test_sale_insufficient_leaves_no_stock_or_ledger():
    product = await _product(f"NOSALE-{uuid.uuid4().hex[:6]}")
    pid = str(product.id)
    try:
        await receive_stock(pid, "TINY", 2, unit_cost=10.0, created_by="test")
        receive_ids = {
            str(row.id)
            for row in await StockAdjustment.find(StockAdjustment.product_id == pid).to_list()
        }
        with pytest.raises(HTTPException) as exc:
            await record_sale(
                _sale_body(pid, 5),
                cashier_id="c1",
                apply_loyalty=False,
                skip_server_pricing=True,
            )
        assert exc.value.status_code == 400
        assert await get_current_stock(pid) == 2
        leftover = await StockAdjustment.find(StockAdjustment.product_id == pid).to_list()
        assert {str(row.id) for row in leftover} == receive_ids
    finally:
        await _cleanup(pid, product)


@pytest.mark.asyncio
async def test_sale_void_writes_in_line_and_matches_on_hand():
    product = await _product(f"VOIDL-{uuid.uuid4().hex[:6]}")
    pid = str(product.id)
    try:
        await receive_stock(pid, "V-B1", 10, unit_cost=10.0, created_by="test")
        txn = await record_sale(
            _sale_body(pid, 2),
            cashier_id="c1",
            apply_loyalty=False,
            skip_server_pricing=True,
        )
        assert await get_current_stock(pid) == 8
        await _assert_book_matches_shelf(pid)

        await void_sale(txn.id, "wrong item", "Manager")
        assert await get_current_stock(pid) == 10
        await _assert_book_matches_shelf(pid)

        voids = await StockAdjustment.find(
            StockAdjustment.product_id == pid,
            StockAdjustment.type == AdjustmentType.void,
        ).to_list()
        assert len(voids) == 1
        assert voids[0].quantity == 2
        assert voids[0].reference_type == "sale"
        assert voids[0].stock_after == 10

        with pytest.raises(HTTPException) as exc:
            await void_sale(txn.id, "again", "Manager")
        assert exc.value.status_code == 400
        assert await get_current_stock(pid) == 10
        await _assert_book_matches_shelf(pid)
    finally:
        await _cleanup(pid, product)


@pytest.mark.asyncio
async def test_sale_edit_decrease_and_increase_keep_ledger_aligned():
    product = await _product(f"EDIT-{uuid.uuid4().hex[:6]}")
    pid = str(product.id)
    try:
        await receive_stock(pid, "E-B1", 20, unit_cost=10.0, created_by="test")
        txn = await record_sale(
            _sale_body(pid, 5),
            cashier_id="c1",
            apply_loyalty=False,
            skip_server_pricing=True,
        )
        assert await get_current_stock(pid) == 15

        await update_transaction(
            txn.id,
            TransactionUpdate(items=[{"product_id": pid, "quantity": 3, "unit_price": 20.0}]),
        )
        assert await get_current_stock(pid) == 17
        await _assert_book_matches_shelf(pid)
        ins = await StockAdjustment.find(
            StockAdjustment.product_id == pid,
            StockAdjustment.reason == f"Sale edit {txn.transaction_number}",
            StockAdjustment.quantity == 2,
        ).to_list()
        assert len(ins) == 1

        await update_transaction(
            txn.id,
            TransactionUpdate(items=[{"product_id": pid, "quantity": 5, "unit_price": 20.0}]),
        )
        assert await get_current_stock(pid) == 15
        await _assert_book_matches_shelf(pid)

        with pytest.raises(HTTPException) as exc:
            await update_transaction(
                txn.id,
                TransactionUpdate(items=[{"product_id": pid, "quantity": 50, "unit_price": 20.0}]),
            )
        assert exc.value.status_code == 400
        assert await get_current_stock(pid) == 15
        await _assert_book_matches_shelf(pid)
    finally:
        await _cleanup(pid, product)


@pytest.mark.asyncio
async def test_sale_edit_remove_line_restocks_and_matches_ledger():
    first = await _product(f"RM1-{uuid.uuid4().hex[:6]}")
    second = await _product(f"RM2-{uuid.uuid4().hex[:6]}")
    pid = str(first.id)
    other_pid = str(second.id)
    try:
        await receive_stock(pid, "R-A", 10, unit_cost=10.0, created_by="test")
        await receive_stock(other_pid, "R-B", 10, unit_cost=10.0, created_by="test")
        txn = await record_sale(
            TransactionCreate(
                items=[
                    TransactionItem(product_id=pid, name="A", sku="A", price=20.0, quantity=2),
                    TransactionItem(product_id=other_pid, name="B", sku="B", price=20.0, quantity=2),
                ],
                subtotal=80.0,
                discount=0.0,
                tax=0.0,
                total=80.0,
                payment_method=PaymentMethod.cash,
                created_by="test",
            ),
            cashier_id="c1",
            apply_loyalty=False,
            skip_server_pricing=True,
        )
        await update_transaction(
            txn.id,
            TransactionUpdate(items=[{"product_id": pid, "quantity": 2, "unit_price": 20.0}]),
        )
        assert await get_current_stock(other_pid) == 10
        await _assert_book_matches_shelf(other_pid)
        assert await get_current_stock(pid) == 8
        await _assert_book_matches_shelf(pid)
    finally:
        await _cleanup(pid, first)
        await _cleanup(other_pid, second)


@pytest.mark.asyncio
async def test_clipped_adjustment_qty_flags_rollforward_variance():
    """Logged −20 but only moved 18: last After matches shelf, quantity sum does not."""
    product = await _product(f"CLIP-{uuid.uuid4().hex[:6]}")
    pid = str(product.id)
    try:
        await receive_stock(pid, "CLIP-A", 38, unit_cost=10.0, created_by="test")
        await adjust_stock(pid, -18, AdjustmentType.adjustment, "partial move", "test")
        clipped = (
            await StockAdjustment.find(
                StockAdjustment.product_id == pid,
                StockAdjustment.reason == "partial move",
            )
            .sort("-created_at")
            .first_or_none()
        )
        assert clipped is not None
        await clipped.set({"quantity": -20, "stock_after": 20})

        integrity = await product_integrity(pid)
        assert integrity["on_hand"] == 20
        assert integrity["ledger_close"] == 18
        assert integrity["variance"] == 2

        await align_ledger_to_on_hand(pid, "repair clipped -20", "Admin")
        assert await get_current_stock(pid) == 20
        await _assert_book_matches_shelf(pid)
    finally:
        await _cleanup(pid, product)


@pytest.mark.asyncio
async def test_orphan_batch_is_not_counted_as_out_of_sync():
    orphan_pid = f"orphan-{uuid.uuid4().hex}"
    leftover = InventoryBatch(
        product_id=orphan_pid,
        batch_number="ORPHAN-195",
        quantity=195,
    )
    await leftover.insert()
    product = await _product(f"CLIPLIST-{uuid.uuid4().hex[:6]}")
    pid = str(product.id)
    try:
        await receive_stock(pid, "LIST-A", 38, unit_cost=10.0, created_by="test")
        await adjust_stock(pid, -18, AdjustmentType.adjustment, "partial move", "test")
        clipped = (
            await StockAdjustment.find(
                StockAdjustment.product_id == pid,
                StockAdjustment.reason == "partial move",
            )
            .sort("-created_at")
            .first_or_none()
        )
        assert clipped is not None
        await clipped.set({"quantity": -20, "stock_after": 20})

        rows = await list_integrity_rows(only_out_of_sync=True)
        assert all(r["product_id"] != orphan_pid for r in rows)
        match = next(r for r in rows if r["product_id"] == pid)
        assert match["product_name"] == product.name
        assert match["product_sku"] == product.sku
        assert match["variance"] == 2
        assert await count_out_of_sync_skus() == len(rows)
    finally:
        await leftover.delete()
        await _cleanup(pid, product)


@pytest.mark.asyncio
async def test_integrity_flags_drift_and_align_repairs_book_only():
    product = await _product(f"DRIFT-{uuid.uuid4().hex[:6]}")
    pid = str(product.id)
    try:
        await receive_stock(pid, "D-B1", 10, unit_cost=10.0, created_by="test")
        batch = await InventoryBatch.find_one(InventoryBatch.product_id == pid)
        assert batch is not None
        col = InventoryBatch.get_motor_collection()
        await col.update_one({"_id": batch.id}, {"$inc": {"quantity": 1}})

        integrity = await product_integrity(pid)
        assert integrity["on_hand"] == 11
        assert integrity["ledger_close"] == 10
        assert integrity["variance"] == 1

        rows = await list_integrity_rows(only_out_of_sync=True)
        match = next(r for r in rows if r["product_id"] == pid)
        assert match["variance"] == 1
        assert match["product_name"] == product.name
        assert match["product_sku"] == product.sku

        await align_ledger_to_on_hand(pid, "align after silent batch increment", "Admin")
        assert await get_current_stock(pid) == 11
        await _assert_book_matches_shelf(pid)
        correction = await StockAdjustment.find_one(
            StockAdjustment.product_id == pid,
            StockAdjustment.type == AdjustmentType.correction,
            StockAdjustment.reason == "align after silent batch increment",
        )
        assert correction is not None
        assert correction.quantity == 1
        assert correction.stock_before == 10
        assert correction.stock_after == 11
    finally:
        await _cleanup(pid, product)


@pytest.mark.asyncio
async def test_integrity_api_and_align_roles(client: AsyncClient, admin_user: User, manager_user: User):
    product = await _product(f"API-{uuid.uuid4().hex[:6]}")
    pid = str(product.id)
    try:
        await receive_stock(pid, "API-B1", 4, unit_cost=10.0, created_by="test")
        batch = await InventoryBatch.find_one(InventoryBatch.product_id == pid)
        assert batch is not None
        await InventoryBatch.get_motor_collection().update_one(
            {"_id": batch.id},
            {"$inc": {"quantity": 2}},
        )

        manager_token = await _login(client, manager_user.email, "managerpass123")
        admin_token = await _login(client, admin_user.email, "adminpass123")

        listed = await client.get(
            "/api/v1/inventory/integrity",
            params={"product_id": pid},
            headers={"Authorization": f"Bearer {manager_token}"},
        )
        assert listed.status_code == 200
        body = listed.json()
        assert body["out_of_sync_count"] >= 1
        row = next(r for r in body["data"] if r["product_id"] == pid)
        assert row["variance"] == 2

        denied = await client.post(
            "/api/v1/inventory/integrity/align",
            json={"product_id": pid, "reason": "manager cannot align"},
            headers={"Authorization": f"Bearer {manager_token}"},
        )
        assert denied.status_code == 403

        aligned = await client.post(
            "/api/v1/inventory/integrity/align",
            json={"product_id": pid, "reason": "admin align"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert aligned.status_code == 200
        assert await product_integrity(pid) == {"on_hand": 6, "ledger_close": 6, "variance": 0}

        summary = await client.get(
            "/api/v1/inventory/movements/summary",
            params={"product_id": pid},
            headers={"Authorization": f"Bearer {manager_token}"},
        )
        assert summary.status_code == 200
        assert summary.json()["variance"] == 0
    finally:
        await _cleanup(pid, product)
