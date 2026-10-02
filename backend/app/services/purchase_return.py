"""Purchase return — PO-linked and supplier modes with settlements."""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

from fastapi import HTTPException, Request, status

from app.models.audit_log import AuditModule
from app.models.purchase_order import POStatus, PurchaseOrder, compute_payment_status
from app.models.purchase_return import (
    PurchaseReturn,
    PurchaseReturnItem,
    PurchaseReturnMode,
    PurchaseReturnStatus,
    ReturnReason,
    ReturnSettlementType,
)
from app.models.supplier import Supplier
from app.models.user import User
from app.models.wallet_ledger import WalletDirection, WalletEntryType
from app.schemas.purchase_return import (
    PurchaseReturnClose,
    PurchaseReturnCreate,
    PurchaseReturnItemResponse,
    PurchaseReturnPaymentResponse,
    PurchaseReturnResponse,
    ReturnableLineResponse,
)
from app.services.audit import log_audit
from app.services.payment_methods import normalize_payment_method
from app.services.po_stock_reverse import (
    aggregate_supplier_returnable_by_product,
    leftover_by_product_for_po,
    leftover_for_po,
    leftover_for_supplier,
    list_supplier_returnable_batches,
    reverse_po_batches,
    reverse_supplier_batches,
)
from app.services.response_cache import bump_commerce_caches
from app.services.wallet_ledger import WALLETS, find_by_reference, post_entry


RETURNABLE_PO_STATUSES = {
    POStatus.ordered,
    POStatus.partial,
    POStatus.received,
}


def _parse_received_date(raw: str | None) -> str:
    today = datetime.now(timezone.utc).date()
    value = (raw or "").strip() or today.isoformat()
    try:
        parsed = date.fromisoformat(value)
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="received_date must be YYYY-MM-DD") from exc
    if parsed > today + timedelta(days=1):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="received_date cannot be far in the future")
    return parsed.isoformat()


async def _payments_for(return_id: str) -> list[PurchaseReturnPaymentResponse]:
    entries = await find_by_reference("purchase_return", return_id)
    entries = sorted(
        entries,
        key=lambda e: (e.date or "", e.created_at.isoformat() if e.created_at else ""),
    )
    out: list[PurchaseReturnPaymentResponse] = []
    for e in entries:
        wallet = e.wallet.value if hasattr(e.wallet, "value") else str(e.wallet)
        out.append(
            PurchaseReturnPaymentResponse(
                id=str(e.id),
                date=e.date or "",
                amount=float(e.amount or 0),
                wallet=wallet,
                remarks=e.remarks or "",
                created_by=e.created_by or "",
            )
        )
    return out


async def _to_response(doc: PurchaseReturn, *, include_payments: bool = False) -> PurchaseReturnResponse:
    total = float(doc.total_amount or 0)
    received = float(getattr(doc, "amount_received", 0) or 0)
    write_off = float(getattr(doc, "write_off_amount", 0) or 0)
    outstanding = (
        round(max(0.0, total - received - write_off), 2)
        if doc.status == PurchaseReturnStatus.requested
        and doc.settlement_type == ReturnSettlementType.refund
        else 0.0
    )
    payments = await _payments_for(str(doc.id)) if include_payments else []
    return PurchaseReturnResponse(
        id=str(doc.id),
        return_number=doc.return_number,
        return_mode=doc.return_mode,
        purchase_order_id=doc.purchase_order_id or "",
        order_number=doc.order_number or "",
        supplier_id=doc.supplier_id,
        supplier_name=doc.supplier_name,
        items=[
            PurchaseReturnItemResponse(
                product_id=i.product_id,
                product_name=i.product_name,
                return_qty=i.return_qty,
                unit_cost=i.unit_cost,
                line_total=i.line_total,
                base_uom=i.base_uom,
            )
            for i in (doc.items or [])
        ],
        total_amount=total,
        amount_received=received,
        write_off_amount=write_off,
        write_off_reason=getattr(doc, "write_off_reason", "") or "",
        remarks=doc.remarks or "",
        reason=doc.reason or ReturnReason.other,
        settlement_type=doc.settlement_type,
        status=doc.status,
        payment_method=doc.payment_method or "cash",
        return_date=doc.return_date or "",
        created_by=doc.created_by or "",
        created_at=doc.created_at.isoformat() if doc.created_at else "",
        updated_at=doc.updated_at.isoformat() if doc.updated_at else "",
        confirmed_at=doc.confirmed_at.isoformat() if doc.confirmed_at else None,
        closed_at=doc.closed_at.isoformat() if doc.closed_at else None,
        write_off_at=doc.write_off_at.isoformat() if getattr(doc, "write_off_at", None) else None,
        amount_outstanding=outstanding,
        payments=payments,
    )



async def _next_return_number() -> str:
    prefix = "PR-"
    count = await PurchaseReturn.find({"return_number": {"$regex": f"^{prefix}"}}).count()
    return f"{prefix}{str(count + 1).zfill(4)}"


def _units(item) -> int:
    return int(getattr(item, "units_per_buy_uom", None) or 1)


def _landed_cost(unit_cost: float, units: int) -> float:
    if units <= 0:
        return round(unit_cost, 4)
    return round(unit_cost / units, 4) if unit_cost > 0 else 0.0


async def _load_products_by_id(product_ids: list[str]) -> dict:
    from bson import ObjectId
    from app.models.product import Product

    if not product_ids:
        return {}
    object_ids = []
    for pid in product_ids:
        try:
            object_ids.append(ObjectId(pid))
        except Exception:
            continue
    products = []
    if object_ids:
        products = await Product.find({"_id": {"$in": object_ids}}).to_list()
    return {str(p.id): p for p in products}


async def _po_line_names_for_supplier(supplier_id: str, product_ids: list[str]) -> dict[str, str]:
    if not product_ids:
        return {}
    wanted = set(product_ids)
    col = PurchaseOrder.get_motor_collection()
    docs = await col.find(
        {"supplier_id": supplier_id},
        {"items.product_id": 1, "items.product_name": 1},
    ).to_list(None)
    names: dict[str, str] = {}
    for po in docs:
        for item in po.get("items") or []:
            pid = str(item.get("product_id") or "")
            if pid in wanted and pid not in names:
                name = (item.get("product_name") or "").strip()
                if name:
                    names[pid] = name
        if len(names) >= len(wanted):
            break
    return names


async def list_returnable_lines_for_po(po: PurchaseOrder) -> list[ReturnableLineResponse]:
    if po.status not in RETURNABLE_PO_STATUSES:
        return []
    po_id = str(po.id)
    product_ids = list({i.product_id for i in (po.items or []) if i.product_id})
    products_by_id = await _load_products_by_id(product_ids)
    leftovers = await leftover_by_product_for_po(po_id, product_ids)

    lines: list[ReturnableLineResponse] = []
    for item in po.items or []:
        received = int(getattr(item, "received_quantity", 0) or 0)
        if received <= 0:
            continue
        leftover = int(leftovers.get(item.product_id, 0))
        if leftover <= 0:
            continue
        units = _units(item)
        landed = _landed_cost(float(item.unit_cost or 0), units)
        product = products_by_id.get(item.product_id)
        name = (item.product_name or "").strip() or (product.name if product else "")
        if not name:
            name = "Unknown product"
        lines.append(
            ReturnableLineResponse(
                product_id=item.product_id,
                product_name=name,
                available_qty=leftover,
                unit_cost=landed,
                base_uom=getattr(item, "base_uom", None) or "pcs",
                received_quantity=received,
                units_per_buy_uom=units,
                sku=(product.sku if product else "") or "",
            )
        )
    return lines


async def list_returnable_lines_for_supplier(supplier_id: str) -> list[ReturnableLineResponse]:
    by_product = await aggregate_supplier_returnable_by_product(supplier_id.strip())
    if not by_product:
        return []

    product_ids = list(by_product.keys())
    products_by_id = await _load_products_by_id(product_ids)
    missing = [pid for pid in product_ids if pid not in products_by_id]
    po_names = await _po_line_names_for_supplier(supplier_id, missing) if missing else {}

    lines: list[ReturnableLineResponse] = []
    for pid, meta in by_product.items():
        if meta["qty"] <= 0:
            continue
        product = products_by_id.get(pid)
        if product:
            name = product.name
            sku = product.sku or ""
            base_uom = getattr(product, "uom", None) or "pcs"
            fallback_cost = float(product.cost_price or 0)
        else:
            name = po_names.get(pid) or "Unknown product"
            sku = ""
            base_uom = "pcs"
            fallback_cost = 0.0
        avg_cost = (
            round(meta["cost_sum"] / meta["cost_qty"], 4)
            if meta["cost_qty"] > 0
            else fallback_cost
        )
        lines.append(
            ReturnableLineResponse(
                product_id=pid,
                product_name=name,
                available_qty=meta["qty"],
                unit_cost=avg_cost,
                base_uom=base_uom,
                received_quantity=meta["qty"],
                units_per_buy_uom=1,
                sku=sku,
            )
        )
    lines.sort(key=lambda x: x.product_name.lower())
    return lines


async def _build_po_linked_items(
    po: PurchaseOrder,
    qty_by_product: dict[str, int],
) -> tuple[list[PurchaseReturnItem], float]:
    po_id = str(po.id)
    po_items_by_id = {i.product_id: i for i in (po.items or [])}
    built: list[PurchaseReturnItem] = []
    total_amount = 0.0

    for product_id, return_qty in qty_by_product.items():
        po_item = po_items_by_id.get(product_id)
        if not po_item:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                detail=f"Product {product_id} is not on this purchase order",
            )
        received = int(getattr(po_item, "received_quantity", 0) or 0)
        if received <= 0:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                detail=f"{po_item.product_name} was not received on this purchase order",
            )
        leftover = await leftover_for_po(product_id, po_id)
        if return_qty > leftover:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"Cannot return {return_qty} unit(s) of {po_item.product_name}: "
                    f"only {leftover} leftover from this purchase order"
                ),
            )
        units = _units(po_item)
        landed = _landed_cost(float(po_item.unit_cost or 0), units)
        line_total = round(landed * return_qty, 2)
        total_amount += line_total
        built.append(
            PurchaseReturnItem(
                product_id=product_id,
                product_name=po_item.product_name,
                return_qty=return_qty,
                unit_cost=landed,
                line_total=line_total,
                base_uom=getattr(po_item, "base_uom", None) or "pcs",
            )
        )
    return built, round(total_amount, 2)


async def _build_supplier_items(
    supplier_id: str,
    qty_by_product: dict[str, int],
) -> tuple[list[PurchaseReturnItem], float]:
    available = {
        line.product_id: line
        for line in await list_returnable_lines_for_supplier(supplier_id)
    }
    built: list[PurchaseReturnItem] = []
    total_amount = 0.0
    for product_id, return_qty in qty_by_product.items():
        line = available.get(product_id)
        if not line:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                detail=f"No returnable stock for product {product_id} from this supplier",
            )
        if return_qty > line.available_qty:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"Cannot return {return_qty} unit(s) of {line.product_name}: "
                    f"only {line.available_qty} leftover from this supplier"
                ),
            )
        line_total = round(line.unit_cost * return_qty, 2)
        total_amount += line_total
        built.append(
            PurchaseReturnItem(
                product_id=product_id,
                product_name=line.product_name,
                return_qty=return_qty,
                unit_cost=line.unit_cost,
                line_total=line_total,
                base_uom=line.base_uom,
            )
        )
    return built, round(total_amount, 2)


async def _apply_po_linked_settlement(
    *,
    po: PurchaseOrder,
    settlement: ReturnSettlementType,
    total_amount: float,
    payment_method: str,
    return_date: str,
    return_number: str,
    return_id: str,
    current_user: User,
    remarks_suffix: str = "",
) -> None:
    if total_amount <= 0 and settlement != ReturnSettlementType.stock_only:
        return

    if settlement == ReturnSettlementType.refund:
        amount_paid = float(po.amount_paid or 0)
        if amount_paid + 0.001 < total_amount:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                detail=(
                    "Refund requires amount already paid covering this payment. "
                    "Use Reduce payable for unpaid balance, or lower the amount."
                ),
            )
        method = normalize_payment_method(payment_method) or "cash"
        if method not in {w.value for w in WALLETS}:
            method = "cash"
        note = f"Purchase return {return_number} ({po.order_number})"
        if remarks_suffix:
            note = f"{note} — {remarks_suffix}"
        await post_entry(
            wallet=method,
            direction=WalletDirection.inflow,
            amount=total_amount,
            entry_type=WalletEntryType.purchase_return,
            date=return_date,
            remarks=note,
            reference_type="purchase_return",
            reference_id=return_id,
            created_by=current_user.name,
        )
        new_paid = round(max(0.0, amount_paid - total_amount), 2)
        new_status = compute_payment_status(new_paid, float(po.total_amount or 0))
        await po.set({
            "amount_paid": new_paid,
            "payment_status": new_status,
            "updated_at": datetime.now(timezone.utc),
        })
        return

    if settlement == ReturnSettlementType.reduce_payable:
        new_total = round(max(0.0, float(po.total_amount or 0) - total_amount), 2)
        new_status = compute_payment_status(float(po.amount_paid or 0), new_total)
        await po.set({
            "total_amount": new_total,
            "payment_status": new_status,
            "updated_at": datetime.now(timezone.utc),
        })
        return

    raise HTTPException(
        status.HTTP_400_BAD_REQUEST,
        detail="PO-linked returns support refund or reduce_payable only",
    )


async def _apply_supplier_settlement(
    *,
    settlement: ReturnSettlementType,
    total_amount: float,
    payment_method: str,
    return_date: str,
    return_number: str,
    return_id: str,
    order_hint: str,
    current_user: User,
    remarks_suffix: str = "",
) -> None:
    if settlement == ReturnSettlementType.stock_only:
        return
    if settlement != ReturnSettlementType.refund:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail="Supplier returns support refund or stock_only only",
        )
    if total_amount <= 0:
        return
    method = normalize_payment_method(payment_method) or "cash"
    if method not in {w.value for w in WALLETS}:
        method = "cash"
    note = f"Supplier return {return_number}" + (f" ({order_hint})" if order_hint else "")
    if remarks_suffix:
        note = f"{note} — {remarks_suffix}"
    await post_entry(
        wallet=method,
        direction=WalletDirection.inflow,
        amount=total_amount,
        entry_type=WalletEntryType.purchase_return,
        date=return_date,
        remarks=note,
        reference_type="purchase_return",
        reference_id=return_id,
        created_by=current_user.name,
    )


async def create_purchase_return(
    body: PurchaseReturnCreate,
    *,
    current_user: User,
    request: Request | None = None,
) -> PurchaseReturn:
    mode = body.return_mode or PurchaseReturnMode.po_linked
    settlement = body.settlement_type or ReturnSettlementType.refund
    return_date = (body.return_date or "").strip() or datetime.now(timezone.utc).date().isoformat()

    qty_by_product: dict[str, int] = {}
    for raw in body.items:
        pid = (raw.product_id or "").strip()
        if not pid:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Each return line needs a product")
        qty_by_product[pid] = qty_by_product.get(pid, 0) + int(raw.return_qty)

    now = datetime.now(timezone.utc)
    return_number = await _next_return_number()

    if mode == PurchaseReturnMode.po_linked:
        po_id = (body.purchase_order_id or "").strip()
        if not po_id:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="purchase_order_id is required")
        po = await PurchaseOrder.get(po_id)
        if not po:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Purchase order not found")
        if po.status == POStatus.cancelled:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Cannot return from a cancelled PO")
        if po.status not in RETURNABLE_PO_STATUSES:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                detail="Purchase returns are only allowed for ordered, partial, or received POs",
            )
        if settlement not in (ReturnSettlementType.refund, ReturnSettlementType.reduce_payable):
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                detail="PO-linked returns support refund or reduce_payable only",
            )

        built_items, total_amount = await _build_po_linked_items(po, qty_by_product)

        # Pre-validate refund coverage before touching stock
        if settlement == ReturnSettlementType.refund and total_amount > 0:
            if float(po.amount_paid or 0) + 0.001 < total_amount:
                raise HTTPException(
                    status.HTTP_400_BAD_REQUEST,
                    detail=(
                        "Refund requires amount already paid covering the return total. "
                        "Use Reduce payable for unpaid balance, or lower the return qty."
                    ),
                )

        # Refund waits for payment confirmation. Reduce payable applies and closes now.
        initial_status = (
            PurchaseReturnStatus.requested
            if settlement == ReturnSettlementType.refund
            else PurchaseReturnStatus.closed
        )
        doc = PurchaseReturn(
            return_number=return_number,
            return_mode=PurchaseReturnMode.po_linked,
            purchase_order_id=str(po.id),
            order_number=po.order_number,
            supplier_id=po.supplier_id,
            supplier_name=po.supplier_name,
            items=built_items,
            total_amount=total_amount,
            remarks=(body.remarks or "").strip(),
            reason=body.reason or ReturnReason.other,
            settlement_type=settlement,
            status=initial_status,
            payment_method=normalize_payment_method(body.payment_method) or "cash",
            return_date=return_date,
            created_by=current_user.name,
            confirmed_at=now if initial_status == PurchaseReturnStatus.closed else None,
            closed_at=now if initial_status == PurchaseReturnStatus.closed else None,
            created_at=now,
            updated_at=now,
        )
        await doc.insert()
        return_id = str(doc.id)
        deductions_made: list = []

        try:
            for item in built_items:
                deductions_made.extend(
                    await reverse_po_batches(
                        product_id=item.product_id,
                        product_name=item.product_name,
                        po_id=str(po.id),
                        base_qty=item.return_qty,
                        created_by=current_user.name,
                        reference_id=return_id,
                    )
                )
            if settlement != ReturnSettlementType.refund:
                await _apply_po_linked_settlement(
                    po=po,
                    settlement=settlement,
                    total_amount=total_amount,
                    payment_method=doc.payment_method,
                    return_date=return_date,
                    return_number=return_number,
                    return_id=return_id,
                    current_user=current_user,
                )
        except Exception:
            if deductions_made:
                from app.services.stock import restock_from_deductions
                await restock_from_deductions(deductions_made)
            await doc.delete()
            raise

    else:
        supplier_id = (body.supplier_id or "").strip()
        if not supplier_id:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="supplier_id is required")
        if (body.purchase_order_id or "").strip():
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                detail="Supplier returns must not set purchase_order_id",
            )
        if settlement not in (ReturnSettlementType.refund, ReturnSettlementType.stock_only):
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                detail="Supplier returns support refund or stock_only only",
            )

        supplier = await Supplier.get(supplier_id)
        supplier_name = supplier.name if supplier else ""
        if not supplier_name:
            # Fallback: any PO for this supplier
            sample = await PurchaseOrder.find_one(PurchaseOrder.supplier_id == supplier_id)
            supplier_name = sample.supplier_name if sample else supplier_id

        built_items, total_amount = await _build_supplier_items(supplier_id, qty_by_product)

        initial_status = (
            PurchaseReturnStatus.requested
            if settlement == ReturnSettlementType.refund
            else PurchaseReturnStatus.closed
        )
        doc = PurchaseReturn(
            return_number=return_number,
            return_mode=PurchaseReturnMode.supplier,
            purchase_order_id="",
            order_number="",
            supplier_id=supplier_id,
            supplier_name=supplier_name,
            items=built_items,
            total_amount=total_amount,
            remarks=(body.remarks or "").strip(),
            reason=body.reason or ReturnReason.expired,
            settlement_type=settlement,
            status=initial_status,
            payment_method=normalize_payment_method(body.payment_method) or "cash",
            return_date=return_date,
            created_by=current_user.name,
            confirmed_at=now if initial_status == PurchaseReturnStatus.closed else None,
            closed_at=now if initial_status == PurchaseReturnStatus.closed else None,
            created_at=now,
            updated_at=now,
        )
        await doc.insert()
        return_id = str(doc.id)
        deductions_made: list = []

        try:
            for item in built_items:
                deductions_made.extend(
                    await reverse_supplier_batches(
                        product_id=item.product_id,
                        product_name=item.product_name,
                        supplier_id=supplier_id,
                        base_qty=item.return_qty,
                        created_by=current_user.name,
                        reference_id=return_id,
                    )
                )
            if settlement != ReturnSettlementType.refund:
                await _apply_supplier_settlement(
                    settlement=settlement,
                    total_amount=total_amount,
                    payment_method=doc.payment_method,
                    return_date=return_date,
                    return_number=return_number,
                    return_id=return_id,
                    order_hint=supplier_name,
                    current_user=current_user,
                )
        except Exception:
            if deductions_made:
                from app.services.stock import restock_from_deductions
                await restock_from_deductions(deductions_made)
            await doc.delete()
            raise

    await bump_commerce_caches()
    await log_audit(
        module=AuditModule.purchase_orders,
        action=(
            "purchase_return_close"
            if doc.status == PurchaseReturnStatus.closed
            else "purchase_return_request"
        ),
        user=current_user,
        request=request,
        entity_type="purchase_return",
        entity_id=str(doc.id),
        new={
            "id": str(doc.id),
            "return_mode": doc.return_mode.value,
            "settlement_type": doc.settlement_type.value,
            "total_amount": doc.total_amount,
        },
    )
    refreshed = await PurchaseReturn.get(str(doc.id))
    return refreshed or doc


async def close_purchase_return(
    return_id: str,
    *,
    current_user: User,
    request: Request | None = None,
    payment_method: str | None = None,
    amount_received: float | None = None,
    remarks: str = "",
    received_date: str | None = None,
) -> PurchaseReturn:
    """Record supplier refund money. Full remaining closes; partial stays requested."""
    doc = await PurchaseReturn.get(return_id)
    if not doc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Purchase return not found")
    if doc.status != PurchaseReturnStatus.requested:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail="Only requested returns can record payment",
        )
    if doc.settlement_type != ReturnSettlementType.refund:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail="Only refund returns wait for payment confirmation",
        )

    total = float(doc.total_amount or 0)
    already = float(getattr(doc, "amount_received", 0) or 0)
    write_off = float(getattr(doc, "write_off_amount", 0) or 0)
    remaining = round(max(0.0, total - already - write_off), 2)
    if remaining <= 0:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail="Nothing left to receive on this return",
        )

    if amount_received is None:
        payment = remaining
    else:
        payment = round(float(amount_received), 2)
    if payment <= 0:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Payment amount must be greater than 0")
    if payment > remaining + 0.001:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail=f"Payment cannot exceed remaining receivable ({remaining})",
        )
    payment = min(payment, remaining)

    method = normalize_payment_method(payment_method or doc.payment_method) or "cash"
    money_date = _parse_received_date(received_date)
    now = datetime.now(timezone.utc)
    return_id_str = str(doc.id)
    is_full = payment + 0.001 >= remaining
    suffix = "full" if is_full else f"partial {payment}"
    note = (remarks or "").strip()
    if note:
        suffix = f"{suffix}; {note}"

    if doc.return_mode == PurchaseReturnMode.po_linked:
        po = await PurchaseOrder.get(doc.purchase_order_id)
        if not po:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Purchase order not found")
        await _apply_po_linked_settlement(
            po=po,
            settlement=doc.settlement_type,
            total_amount=payment,
            payment_method=method,
            return_date=money_date,
            return_number=doc.return_number,
            return_id=return_id_str,
            current_user=current_user,
            remarks_suffix=suffix,
        )
    else:
        await _apply_supplier_settlement(
            settlement=doc.settlement_type,
            total_amount=payment,
            payment_method=method,
            return_date=money_date,
            return_number=doc.return_number,
            return_id=return_id_str,
            order_hint=doc.supplier_name or "",
            current_user=current_user,
            remarks_suffix=suffix,
        )

    new_received = round(already + payment, 2)
    updates: dict = {
        "amount_received": new_received,
        "payment_method": method,
        "updated_at": now,
    }
    if is_full:
        updates["status"] = PurchaseReturnStatus.closed
        updates["closed_at"] = now
        updates["confirmed_at"] = now
    if note:
        existing = (doc.remarks or "").strip()
        updates["remarks"] = f"{existing}\n{note}".strip() if existing else note

    await doc.set(updates)
    await bump_commerce_caches()
    await log_audit(
        module=AuditModule.purchase_orders,
        action="purchase_return_close" if is_full else "purchase_return_partial_receive",
        user=current_user,
        request=request,
        entity_type="purchase_return",
        entity_id=return_id_str,
        new={
            "id": return_id_str,
            "status": (PurchaseReturnStatus.closed if is_full else PurchaseReturnStatus.requested).value,
            "payment_method": method,
            "payment_amount": payment,
            "amount_received": new_received,
            "received_date": money_date,
            "total_amount": total,
        },
    )
    refreshed = await PurchaseReturn.get(return_id_str)
    return refreshed or doc


async def write_off_purchase_return(
    return_id: str,
    *,
    reason: str,
    current_user: User,
    request: Request | None = None,
) -> PurchaseReturn:
    """Close remaining receivable without wallet cash (supplier will not pay rest)."""
    doc = await PurchaseReturn.get(return_id)
    if not doc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Purchase return not found")
    if doc.status != PurchaseReturnStatus.requested:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail="Only requested returns can be written off",
        )
    if doc.settlement_type != ReturnSettlementType.refund:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail="Only refund returns have receivable to write off",
        )
    note = (reason or "").strip()
    if not note:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Write-off reason is required")

    total = float(doc.total_amount or 0)
    already = float(getattr(doc, "amount_received", 0) or 0)
    prior_write_off = float(getattr(doc, "write_off_amount", 0) or 0)
    remaining = round(max(0.0, total - already - prior_write_off), 2)
    if remaining <= 0:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Nothing left to write off")

    now = datetime.now(timezone.utc)
    existing = (doc.remarks or "").strip()
    remarks = f"{existing}\nWrite-off: {note}".strip() if existing else f"Write-off: {note}"
    await doc.set({
        "write_off_amount": round(prior_write_off + remaining, 2),
        "write_off_reason": note,
        "write_off_at": now,
        "status": PurchaseReturnStatus.closed,
        "closed_at": now,
        "confirmed_at": now,
        "remarks": remarks,
        "updated_at": now,
    })
    await bump_commerce_caches()
    await log_audit(
        module=AuditModule.purchase_orders,
        action="purchase_return_write_off",
        user=current_user,
        request=request,
        entity_type="purchase_return",
        entity_id=str(doc.id),
        new={
            "id": str(doc.id),
            "write_off_amount": remaining,
            "reason": note,
            "status": PurchaseReturnStatus.closed.value,
        },
    )
    refreshed = await PurchaseReturn.get(str(doc.id))
    return refreshed or doc


# Re-export for router
to_response = _to_response
