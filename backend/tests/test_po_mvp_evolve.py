"""PO workflow, goods receipt, invoice, and return settlement coverage."""

from __future__ import annotations

import uuid
from unittest.mock import MagicMock

import pytest
from httpx import ASGITransport, AsyncClient

from app.auth.jwt import hash_password
from app.database import init_db
from app.main import app
from app.models.goods_receipt import GoodsReceipt
from app.models.inventory import InventoryBatch, StockAdjustment
from app.models.product import Product
from app.models.purchase_invoice import PurchaseInvoice, SupplierCredit
from app.models.purchase_order import POStatus, PurchaseOrder, PurchaseOrderItem
from app.models.purchase_return import PurchaseReturn, ReturnSettlementType
from app.models.user import User, UserRole
from app.models.wallet_ledger import WalletEntryType, WalletLedgerEntry
from app.schemas.purchase_order import PurchaseOrderReceiveItem
from app.services.goods_receipt_service import create_and_confirm_goods_receipt
from app.services.po_receive import receive_purchase_order_items
from app.services.stock import get_current_stock


@pytest.fixture(autouse=True)
async def setup_db():
    await init_db()


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


async def _manager() -> User:
    user = User(
        email=f"po-mvp-{uuid.uuid4().hex[:8]}@komart.com",
        name="PO MVP Tester",
        hashed_password=hash_password("managerpass123"),
        role=UserRole.manager,
        is_active=True,
    )
    await user.insert()
    return user


def _mock_request() -> MagicMock:
    req = MagicMock()
    req.headers.get.return_value = ""
    req.client.host = "127.0.0.1"
    req.state.request_id = "test-request"
    return req


async def _product(name: str, cost: float = 10.0) -> Product:
    sku = f"MVP-{uuid.uuid4().hex[:8]}"
    product = Product(
        name=name,
        sku=sku,
        barcode=sku,
        brand="T",
        country_of_origin="Nepal",
        category="Snacks",
        supplier_id="sup-1",
        supplier_name="Supplier",
        cost_price=cost,
        selling_price=cost * 2,
        is_active=True,
    )
    await product.insert()
    return product


async def _auth(client: AsyncClient, user: User) -> dict[str, str]:
    login = await client.post(
        "/api/v1/auth/login",
        json={"email": user.email, "password": "managerpass123"},
    )
    assert login.status_code == 200
    return {"Authorization": f"Bearer {login.json()['access_token']}"}


async def _cleanup(po: PurchaseOrder, *products: Product, user: User | None = None) -> None:
    pid = str(po.id)
    await GoodsReceipt.find(GoodsReceipt.purchase_order_id == pid).delete()
    await PurchaseInvoice.find(PurchaseInvoice.purchase_order_id == pid).delete()
    await PurchaseReturn.find(PurchaseReturn.purchase_order_id == pid).delete()
    await SupplierCredit.find(SupplierCredit.purchase_order_id == pid).delete()
    await WalletLedgerEntry.find(WalletLedgerEntry.reference_type == "purchase_return").delete()
    await InventoryBatch.find(InventoryBatch.purchase_order_id == pid).delete()
    for product in products:
        await InventoryBatch.find(InventoryBatch.product_id == str(product.id)).delete()
        await StockAdjustment.find(StockAdjustment.product_id == str(product.id)).delete()
        await product.delete()
    await PurchaseOrder.find(PurchaseOrder.order_number == po.order_number).delete()
    if user:
        await user.delete()


@pytest.mark.asyncio
async def test_submit_approve_send_workflow(client: AsyncClient):
    product = await _product("Workflow PO")
    user = await _manager()
    po = PurchaseOrder(
        order_number=f"PO-WF-{uuid.uuid4().hex[:6]}",
        supplier_id="sup-1",
        supplier_name="Supplier",
        status=POStatus.draft,
        items=[
            PurchaseOrderItem(
                product_id=str(product.id),
                product_name=product.name,
                quantity=2,
                unit_cost=10.0,
            ),
        ],
        total_amount=20.0,
        ordered_by=user.name,
    )
    await po.insert()
    headers = await _auth(client, user)

    submit = await client.post(f"/api/v1/purchase-orders/{po.id}/submit", headers=headers)
    assert submit.status_code == 200, submit.text
    assert submit.json()["status"] == "pending_approval"

    approve = await client.post(f"/api/v1/purchase-orders/{po.id}/approve", headers=headers)
    assert approve.status_code == 200
    assert approve.json()["status"] == "approved"

    send = await client.post(f"/api/v1/purchase-orders/{po.id}/send", headers=headers)
    assert send.status_code == 200
    assert send.json()["status"] == "ordered"

    await _cleanup(po, product, user=user)


@pytest.mark.asyncio
async def test_goods_receipt_creates_invoice_and_stock(client: AsyncClient):
    product = await _product("GR Invoice")
    user = await _manager()
    po = PurchaseOrder(
        order_number=f"PO-GR-{uuid.uuid4().hex[:6]}",
        supplier_id="sup-1",
        supplier_name="Supplier",
        status=POStatus.ordered,
        items=[
            PurchaseOrderItem(
                product_id=str(product.id),
                product_name=product.name,
                quantity=5,
                unit_cost=12.0,
                received_quantity=0,
            ),
        ],
        total_amount=60.0,
        ordered_by=user.name,
    )
    await po.insert()

    gr, refreshed = await create_and_confirm_goods_receipt(
        str(po.id),
        [PurchaseOrderReceiveItem(product_id=str(product.id), receive_quantity=3)],
        created_by=user.name,
        current_user=user,
        request=_mock_request(),
        bill_no="BILL-1",
    )
    assert gr.status.value == "confirmed"
    assert await get_current_stock(str(product.id)) == 3
    assert refreshed.status == POStatus.partial

    invoices = await PurchaseInvoice.find(
        PurchaseInvoice.purchase_order_id == str(po.id),
    ).to_list()
    assert len(invoices) >= 1
    assert invoices[0].total_amount == 36.0  # 3 * 12

    # second partial receive
    await create_and_confirm_goods_receipt(
        str(po.id),
        [PurchaseOrderReceiveItem(product_id=str(product.id), receive_quantity=2)],
        created_by=user.name,
        current_user=user,
        request=_mock_request(),
    )
    assert await get_current_stock(str(product.id)) == 5
    receipts = await GoodsReceipt.find(GoodsReceipt.purchase_order_id == str(po.id)).to_list()
    assert len(receipts) == 2
    invoices = await PurchaseInvoice.find(
        PurchaseInvoice.purchase_order_id == str(po.id),
    ).to_list()
    assert len(invoices) == 2
    assert sum(i.total_amount for i in invoices) == 60.0

    await _cleanup(po, product, user=user)


@pytest.mark.asyncio
async def test_return_credit_settlement_no_wallet(client: AsyncClient):
    product = await _product("Return Credit")
    user = await _manager()
    po = PurchaseOrder(
        order_number=f"PO-RC-{uuid.uuid4().hex[:6]}",
        supplier_id="sup-1",
        supplier_name="Supplier",
        status=POStatus.ordered,
        items=[
            PurchaseOrderItem(
                product_id=str(product.id),
                product_name=product.name,
                quantity=4,
                unit_cost=10.0,
            ),
        ],
        total_amount=40.0,
        ordered_by=user.name,
    )
    await po.insert()
    await receive_purchase_order_items(
        str(po.id),
        [PurchaseOrderReceiveItem(product_id=str(product.id), receive_quantity=4)],
        created_by=user.name,
        current_user=user,
        request=_mock_request(),
    )

    headers = await _auth(client, user)
    before_wallet = await WalletLedgerEntry.find(
        WalletLedgerEntry.entry_type == WalletEntryType.purchase_return,
    ).count()

    res = await client.post(
        "/api/v1/purchase-returns",
        headers=headers,
        json={
            "purchase_order_id": str(po.id),
            "items": [{"product_id": str(product.id), "return_qty": 2}],
            "settlement_type": "credit",
            "payment_method": "cash",
            "reason": "damaged",
        },
    )
    assert res.status_code == 201, res.text
    assert res.json()["settlement_type"] == "credit"
    assert await get_current_stock(str(product.id)) == 2

    after_wallet = await WalletLedgerEntry.find(
        WalletLedgerEntry.entry_type == WalletEntryType.purchase_return,
    ).count()
    assert after_wallet == before_wallet

    credits = await SupplierCredit.find(
        SupplierCredit.purchase_order_id == str(po.id),
    ).to_list()
    assert len(credits) == 1
    assert credits[0].amount == 20.0
    assert credits[0].remaining_amount == 20.0

    await _cleanup(po, product, user=user)


@pytest.mark.asyncio
async def test_po_payment_proxies_to_invoice(client: AsyncClient):
    product = await _product("Pay Invoice")
    user = await _manager()
    po = PurchaseOrder(
        order_number=f"PO-PAY-{uuid.uuid4().hex[:6]}",
        supplier_id="sup-1",
        supplier_name="Supplier",
        status=POStatus.ordered,
        items=[
            PurchaseOrderItem(
                product_id=str(product.id),
                product_name=product.name,
                quantity=2,
                unit_cost=25.0,
            ),
        ],
        total_amount=50.0,
        ordered_by=user.name,
    )
    await po.insert()
    await create_and_confirm_goods_receipt(
        str(po.id),
        [PurchaseOrderReceiveItem(product_id=str(product.id), receive_quantity=2)],
        created_by=user.name,
        current_user=user,
        request=_mock_request(),
    )

    headers = await _auth(client, user)
    pay = await client.post(
        f"/api/v1/purchase-orders/{po.id}/payments",
        headers=headers,
        json={
            "amount": 20.0,
            "date": "2026-09-18",
            "payment_method": "cash",
            "notes": "partial",
        },
    )
    assert pay.status_code == 200, pay.text
    body = pay.json()
    assert body["amount_paid"] == 20.0
    assert body["payment_status"] == "partial"

    inv = await PurchaseInvoice.find_one(PurchaseInvoice.purchase_order_id == str(po.id))
    assert inv is not None
    assert inv.amount_paid == 20.0

    await _cleanup(po, product, user=user)


@pytest.mark.asyncio
async def test_pay_without_goods_receipt_is_400(client: AsyncClient):
    product = await _product("Pay No GR")
    user = await _manager()
    po = PurchaseOrder(
        order_number=f"PO-NOGR-{uuid.uuid4().hex[:6]}",
        supplier_id="sup-1",
        supplier_name="Supplier",
        status=POStatus.ordered,
        items=[
            PurchaseOrderItem(
                product_id=str(product.id),
                product_name=product.name,
                quantity=2,
                unit_cost=25.0,
            ),
        ],
        total_amount=50.0,
        ordered_by=user.name,
    )
    await po.insert()
    headers = await _auth(client, user)
    pay = await client.post(
        f"/api/v1/purchase-orders/{po.id}/payments",
        headers=headers,
        json={
            "amount": 20.0,
            "date": "2026-09-18",
            "payment_method": "cash",
        },
    )
    assert pay.status_code == 400
    assert "receive" in pay.json()["detail"].lower()
    invoices = await PurchaseInvoice.find(
        PurchaseInvoice.purchase_order_id == str(po.id),
    ).to_list()
    assert len(invoices) == 0
    await _cleanup(po, product, user=user)


@pytest.mark.asyncio
async def test_cancel_voids_open_invoices(client: AsyncClient):
    from app.models.purchase_invoice import InvoiceStatus
    from app.models.user import UserRole
    from app.services.po_cancel import cancel_purchase_order

    product = await _product("Cancel Invoice")
    user = await _manager()
    await user.set({"role": UserRole.admin})
    po = PurchaseOrder(
        order_number=f"PO-CINV-{uuid.uuid4().hex[:6]}",
        supplier_id="sup-1",
        supplier_name="Supplier",
        status=POStatus.ordered,
        items=[
            PurchaseOrderItem(
                product_id=str(product.id),
                product_name=product.name,
                quantity=2,
                unit_cost=15.0,
            ),
        ],
        total_amount=30.0,
        ordered_by=user.name,
    )
    await po.insert()
    await create_and_confirm_goods_receipt(
        str(po.id),
        [PurchaseOrderReceiveItem(product_id=str(product.id), receive_quantity=2)],
        created_by=user.name,
        current_user=user,
        request=_mock_request(),
    )
    inv_before = await PurchaseInvoice.find_one(PurchaseInvoice.purchase_order_id == str(po.id))
    assert inv_before is not None
    assert inv_before.status != InvoiceStatus.cancelled

    po = await PurchaseOrder.get(str(po.id))
    assert po is not None
    cancelled = await cancel_purchase_order(po, current_user=user, request=_mock_request())
    assert cancelled.status == POStatus.cancelled

    inv_after = await PurchaseInvoice.get(str(inv_before.id))
    assert inv_after is not None
    assert inv_after.status == InvoiceStatus.cancelled
    assert inv_after.amount_paid == 0.0
    assert await get_current_stock(str(product.id)) == 0

    await _cleanup(cancelled, product, user=user)


@pytest.mark.asyncio
async def test_replacement_gr_skips_invoice(client: AsyncClient):
    product = await _product("Replacement GR")
    user = await _manager()
    po = PurchaseOrder(
        order_number=f"PO-RPL-{uuid.uuid4().hex[:6]}",
        supplier_id="sup-1",
        supplier_name="Supplier",
        status=POStatus.ordered,
        items=[
            PurchaseOrderItem(
                product_id=str(product.id),
                product_name=product.name,
                quantity=2,
                unit_cost=10.0,
                received_quantity=0,
            ),
        ],
        total_amount=20.0,
        ordered_by=user.name,
    )
    await po.insert()
    await create_and_confirm_goods_receipt(
        str(po.id),
        [PurchaseOrderReceiveItem(product_id=str(product.id), receive_quantity=2)],
        created_by=user.name,
        current_user=user,
        request=_mock_request(),
    )
    assert await get_current_stock(str(product.id)) == 2
    before_count = await PurchaseInvoice.find(
        PurchaseInvoice.purchase_order_id == str(po.id),
    ).count()
    assert before_count == 1

    # Simulate return (stock out) then replacement GR after full receive
    from app.services.po_amend import _reverse_po_receive
    await _reverse_po_receive(
        product_id=str(product.id),
        product_name=product.name,
        po_id=str(po.id),
        base_qty=1,
        created_by=user.name,
        reason="test return",
    )
    assert await get_current_stock(str(product.id)) == 1

    gr, _ = await create_and_confirm_goods_receipt(
        str(po.id),
        [PurchaseOrderReceiveItem(product_id=str(product.id), receive_quantity=1)],
        created_by=user.name,
        current_user=user,
        request=_mock_request(),
        replacement_for_return_id="fake-return-id",
    )
    assert gr.replacement_for_return_id == "fake-return-id"
    assert await get_current_stock(str(product.id)) == 2

    after = await PurchaseInvoice.find(
        PurchaseInvoice.purchase_order_id == str(po.id),
    ).to_list()
    assert len(after) == before_count  # no new billable invoice

    await _cleanup(po, product, user=user)


@pytest.mark.asyncio
async def test_charges_applied_on_first_invoice_only(client: AsyncClient):
    product = await _product("Charges Split", cost=10.0)
    user = await _manager()
    po = PurchaseOrder(
        order_number=f"PO-CHG-{uuid.uuid4().hex[:6]}",
        supplier_id="sup-1",
        supplier_name="Supplier",
        status=POStatus.ordered,
        items=[
            PurchaseOrderItem(
                product_id=str(product.id),
                product_name=product.name,
                quantity=4,
                unit_cost=10.0,
            ),
        ],
        total_amount=45.0,  # 40 + tax 5
        tax=5.0,
        ordered_by=user.name,
    )
    await po.insert()
    await create_and_confirm_goods_receipt(
        str(po.id),
        [PurchaseOrderReceiveItem(product_id=str(product.id), receive_quantity=2)],
        created_by=user.name,
        current_user=user,
        request=_mock_request(),
    )
    await create_and_confirm_goods_receipt(
        str(po.id),
        [PurchaseOrderReceiveItem(product_id=str(product.id), receive_quantity=2)],
        created_by=user.name,
        current_user=user,
        request=_mock_request(),
    )
    invoices = sorted(
        await PurchaseInvoice.find(PurchaseInvoice.purchase_order_id == str(po.id)).to_list(),
        key=lambda i: i.created_at,
    )
    assert len(invoices) == 2
    assert invoices[0].tax == 5.0
    assert invoices[0].total_amount == 25.0  # 20 + 5
    assert invoices[1].tax == 0.0
    assert invoices[1].total_amount == 20.0

    await _cleanup(po, product, user=user)


@pytest.mark.asyncio
async def test_charges_not_reapplied_after_cancelled_first_invoice(client: AsyncClient):
    from app.models.purchase_invoice import InvoiceStatus

    product = await _product("Charges After Cancel", cost=10.0)
    user = await _manager()
    po = PurchaseOrder(
        order_number=f"PO-CHGC-{uuid.uuid4().hex[:6]}",
        supplier_id="sup-1",
        supplier_name="Supplier",
        status=POStatus.ordered,
        items=[
            PurchaseOrderItem(
                product_id=str(product.id),
                product_name=product.name,
                quantity=4,
                unit_cost=10.0,
            ),
        ],
        total_amount=45.0,
        tax=5.0,
        ordered_by=user.name,
    )
    await po.insert()
    await create_and_confirm_goods_receipt(
        str(po.id),
        [PurchaseOrderReceiveItem(product_id=str(product.id), receive_quantity=2)],
        created_by=user.name,
        current_user=user,
        request=_mock_request(),
    )
    first = await PurchaseInvoice.find_one(PurchaseInvoice.purchase_order_id == str(po.id))
    assert first is not None
    assert first.tax == 5.0
    await first.set({"status": InvoiceStatus.cancelled, "total_amount": 0.0, "amount_paid": 0.0})

    await create_and_confirm_goods_receipt(
        str(po.id),
        [PurchaseOrderReceiveItem(product_id=str(product.id), receive_quantity=2)],
        created_by=user.name,
        current_user=user,
        request=_mock_request(),
    )
    invoices = sorted(
        await PurchaseInvoice.find(PurchaseInvoice.purchase_order_id == str(po.id)).to_list(),
        key=lambda i: i.created_at,
    )
    assert len(invoices) == 2
    assert invoices[1].status != InvoiceStatus.cancelled
    assert invoices[1].tax == 0.0
    assert invoices[1].total_amount == 20.0

    await _cleanup(po, product, user=user)


@pytest.mark.asyncio
async def test_status_patch_rejects_non_cancel_non_place(client: AsyncClient):
    product = await _product("Status Lock")
    user = await _manager()
    po = PurchaseOrder(
        order_number=f"PO-LOCK-{uuid.uuid4().hex[:6]}",
        supplier_id="sup-1",
        supplier_name="Supplier",
        status=POStatus.ordered,
        items=[
            PurchaseOrderItem(
                product_id=str(product.id),
                product_name=product.name,
                quantity=1,
                unit_cost=10.0,
            ),
        ],
        total_amount=10.0,
        ordered_by=user.name,
    )
    await po.insert()
    headers = await _auth(client, user)
    res = await client.patch(
        f"/api/v1/purchase-orders/{po.id}/status",
        headers=headers,
        json={"status": "received"},
    )
    assert res.status_code == 400
    still = await PurchaseOrder.get(str(po.id))
    assert still is not None
    assert still.status == POStatus.ordered
    await _cleanup(po, product, user=user)


@pytest.mark.asyncio
async def test_create_rejects_partial_status(client: AsyncClient):
    product = await _product("Create Status")
    user = await _manager()
    headers = await _auth(client, user)
    res = await client.post(
        "/api/v1/purchase-orders",
        headers=headers,
        json={
            "supplier_id": "sup-1",
            "supplier_name": "Supplier",
            "status": "partial",
            "items": [
                {
                    "product_id": str(product.id),
                    "product_name": product.name,
                    "quantity": 1,
                    "unit_cost": 10.0,
                }
            ],
        },
    )
    assert res.status_code == 400
    await product.delete()
    await user.delete()


@pytest.mark.asyncio
async def test_direct_invoice_pay_requires_gr_link(client: AsyncClient):
    from app.models.purchase_invoice import InvoiceStatus, PurchaseInvoice
    from datetime import date

    product = await _product("Pay No Link")
    user = await _manager()
    po = PurchaseOrder(
        order_number=f"PO-NOLINK-{uuid.uuid4().hex[:6]}",
        supplier_id="sup-1",
        supplier_name="Supplier",
        status=POStatus.ordered,
        items=[
            PurchaseOrderItem(
                product_id=str(product.id),
                product_name=product.name,
                quantity=1,
                unit_cost=10.0,
            ),
        ],
        total_amount=10.0,
        ordered_by=user.name,
    )
    await po.insert()
    inv = PurchaseInvoice(
        invoice_number=f"INV-NOLINK-{uuid.uuid4().hex[:6]}",
        purchase_order_id=str(po.id),
        order_number=po.order_number,
        supplier_id=po.supplier_id,
        supplier_name=po.supplier_name,
        invoice_date=date.today().isoformat(),
        due_date=date.today().isoformat(),
        subtotal=10.0,
        total_amount=10.0,
        amount_paid=0.0,
        status=InvoiceStatus.unpaid,
        goods_receipt_ids=[],
        created_by=user.name,
    )
    await inv.insert()
    headers = await _auth(client, user)
    pay = await client.post(
        f"/api/v1/purchase-invoices/{inv.id}/payments",
        headers=headers,
        json={
            "amount": 10.0,
            "date": date.today().isoformat(),
            "payment_method": "cash",
        },
    )
    assert pay.status_code == 400
    assert "goods receipt" in pay.json()["detail"].lower()
    await inv.delete()
    await _cleanup(po, product, user=user)


@pytest.mark.asyncio
async def test_bill_no_propagates_to_po_gr_invoice_and_payment(client: AsyncClient):
    from app.models.purchase_invoice import SupplierPayment
    from app.schemas.purchase_order import PurchaseOrderPaymentCreate
    from app.services.purchase_invoice_service import pay_po_via_open_invoice

    product = await _product("Bill Prop")
    user = await _manager()
    po = PurchaseOrder(
        order_number=f"PO-BILL-{uuid.uuid4().hex[:6]}",
        supplier_id="sup-1",
        supplier_name="Supplier",
        status=POStatus.ordered,
        items=[
            PurchaseOrderItem(
                product_id=str(product.id),
                product_name=product.name,
                quantity=2,
                unit_cost=10.0,
            ),
        ],
        total_amount=20.0,
        ordered_by=user.name,
    )
    await po.insert()

    gr, refreshed = await create_and_confirm_goods_receipt(
        str(po.id),
        [PurchaseOrderReceiveItem(product_id=str(product.id), receive_quantity=2)],
        created_by=user.name,
        current_user=user,
        request=_mock_request(),
        bill_no="BILL-99",
    )
    assert gr.bill_no == "BILL-99"
    assert refreshed.bill_no == "BILL-99"

    inv = await PurchaseInvoice.find_one(PurchaseInvoice.purchase_order_id == str(po.id))
    assert inv is not None
    assert inv.supplier_invoice_no == "BILL-99"

    pay_po = await pay_po_via_open_invoice(
        str(po.id),
        PurchaseOrderPaymentCreate(
            amount=20.0,
            date="2026-09-18",
            payment_method="cash",
            # bill_no omitted — should inherit PO bill
        ),
        current_user=user,
        request=_mock_request(),
    )
    assert any((p.bill_no or "") == "BILL-99" for p in (pay_po.payments or []))

    sp = await SupplierPayment.find_one(SupplierPayment.purchase_order_id == str(po.id))
    assert sp is not None
    assert sp.bill_no == "BILL-99"

    await SupplierPayment.find(SupplierPayment.purchase_order_id == str(po.id)).delete()
    await _cleanup(po, product, user=user)
