"""Sale recording — transactions as the sales ledger with stock audit trail."""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import HTTPException, status

from app.models.customer import Customer, MembershipTier
from app.models.transaction import Transaction, TransactionItem, BatchAllocation, TransactionStatus
from app.models.inventory import AdjustmentType, StockAdjustment
from app.models.product import Product, ProductStatus, product_is_billable
from app.schemas.transaction import TransactionCreate, TransactionResponse
from app.services.stock import (
    BatchDeduction,
    check_stock_available,
    deduct_stock_fefo,
    record_inventory_change,
    restock_from_deductions,
)
from app.services.store_settings import get_store_settings


def _compute_tier(total_spent: float) -> MembershipTier:
    if total_spent >= 100000:
        return MembershipTier.platinum
    if total_spent >= 50000:
        return MembershipTier.gold
    if total_spent >= 25000:
        return MembershipTier.silver
    return MembershipTier.bronze


async def _next_txn_number() -> str:
    settings = await get_store_settings()
    prefix_base = (settings.transaction_prefix or "TXN").strip().upper()
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    prefix = f"{prefix_base}-{today}-"
    count = await Transaction.find({"transaction_number": {"$regex": f"^{prefix}"}}).count()
    return f"{prefix}{str(count + 1).zfill(3)}"


from app.schemas.discount import EvaluateCartItem
from app.services.discounts import evaluate_discounts


async def prepare_sale_body(body: TransactionCreate) -> TransactionCreate:
    """Apply promotion rules server-side and normalize discount fields."""
    evaluate_items: list[EvaluateCartItem] = []
    for item in body.items:
        product = await Product.get(item.product_id)
        evaluate_items.append(
            EvaluateCartItem(
                product_id=item.product_id,
                price=item.price,
                quantity=item.quantity,
                category=product.category if product else "",
            )
        )

    evaluated = await evaluate_discounts(evaluate_items, coupon_code=body.coupon_code or "")
    line_map = {line.product_id: line.per_unit_discount for line in evaluated.line_items}
    items = [
        item.model_copy(update={"discount": line_map.get(item.product_id, item.discount)})
        for item in body.items
    ]

    line_discount_total = sum(i.discount * i.quantity for i in items)
    loyalty = body.loyalty_points_redeemed
    manual = max(0.0, body.manual_discount)
    if manual == 0 and body.discount > 0 and not body.applied_promotions:
        manual = max(0.0, body.discount - evaluated.cart_discount - loyalty)

    txn_discount = round(evaluated.cart_discount + manual + loyalty, 2)
    total = round(body.subtotal - line_discount_total - txn_discount + body.tax, 2)

    return body.model_copy(
        update={
            "items": items,
            "promotion_discount": evaluated.promotion_discount_total,
            "manual_discount": manual,
            "discount": txn_discount,
            "applied_promotions": evaluated.applied_promotions,
            "total": total,
        }
    )


def _to_response(txn: Transaction) -> TransactionResponse:
    return TransactionResponse(
        id=str(txn.id),
        transaction_number=txn.transaction_number,
        customer_id=txn.customer_id,
        customer_name=txn.customer_name,
        items=txn.items,
        subtotal=txn.subtotal,
        discount=txn.discount,
        promotion_discount=getattr(txn, "promotion_discount", 0.0) or 0.0,
        manual_discount=getattr(txn, "manual_discount", 0.0) or 0.0,
        applied_promotions=getattr(txn, "applied_promotions", []) or [],
        coupon_code=getattr(txn, "coupon_code", "") or "",
        tax=txn.tax,
        loyalty_points_redeemed=txn.loyalty_points_redeemed,
        total=txn.total,
        payment_method=txn.payment_method,
        status=getattr(txn, "status", TransactionStatus.completed),
        void_reason=getattr(txn, "void_reason", "") or "",
        notes=getattr(txn, "notes", "") or "",
        created_by=txn.created_by,
        cashier_id=txn.cashier_id,
        created_at=txn.created_at.isoformat(),
        total_cost=round(getattr(txn, "total_cost", 0.0) or 0.0, 2),
    )


async def record_sale(body: TransactionCreate, cashier_id: str | None = None) -> TransactionResponse:
    body = await prepare_sale_body(body)

    for item in body.items:
        product = await Product.get(item.product_id)
        if not product:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Product not found")
        if not product_is_billable(product):
            if product.status == ProductStatus.discontinued:
                detail = f"Product '{product.name}' is discontinued and cannot be sold"
            elif product.selling_price <= 0:
                detail = f"Product '{product.name}' has no selling price and cannot be sold"
            else:
                detail = f"Product '{product.name}' is not available for sale"
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=detail)
        await check_stock_available(item.product_id, item.quantity)

    txn_number = await _next_txn_number()
    all_deductions: list[BatchDeduction] = []
    adjustment_ids: list[str] = []
    enriched_items: list[TransactionItem] = []
    txn_id: str | None = None

    try:
        for item in body.items:
            product = await Product.get(item.product_id)
            if not product:
                raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Product not found")
            if not product_is_billable(product):
                if product.status == ProductStatus.discontinued:
                    detail = f"Product '{product.name}' is discontinued and cannot be sold"
                elif product.selling_price <= 0:
                    detail = f"Product '{product.name}' has no selling price and cannot be sold"
                else:
                    detail = f"Product '{product.name}' is not available for sale"
                raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=detail)
            stock_before = product.stock

            deductions = await deduct_stock_fefo(item.product_id, item.quantity)
            all_deductions.extend(deductions)

            running_stock = stock_before
            for deduction in deductions:
                running_after = running_stock - deduction.quantity
                adj = await record_inventory_change(
                    product=product,
                    quantity=-deduction.quantity,
                    adjustment_type=AdjustmentType.sale,
                    reason=f"Sale {txn_number}",
                    created_by=body.created_by,
                    stock_before=running_stock,
                    stock_after=running_after,
                    batch_id=deduction.batch_id,
                    unit_cost=deduction.unit_cost,
                    unit_selling_price=item.price,
                    line_discount=item.discount,
                    category=product.category,
                )
                adjustment_ids.append(str(adj.id))
                running_stock = running_after

            total_line_cost = sum(d.quantity * d.unit_cost for d in deductions)
            weighted_cost = (
                total_line_cost / item.quantity if item.quantity else product.cost_price
            )
            allocations = [
                BatchAllocation(
                    batch_id=d.batch_id,
                    quantity=d.quantity,
                    unit_cost=d.unit_cost,
                )
                for d in deductions
            ]
            enriched_items.append(
                item.model_copy(
                    update={
                        "list_price": product.selling_price,
                        "unit_cost": round(weighted_cost, 4),
                        "category": product.category,
                        "batch_allocations": allocations,
                    }
                )
            )

        total_cost = round(sum(i.unit_cost * i.quantity for i in enriched_items), 2)
        txn_payload = body.model_dump()
        txn_payload["items"] = enriched_items
        txn_payload["total_cost"] = total_cost

        txn = Transaction(
            transaction_number=txn_number,
            cashier_id=cashier_id,
            **txn_payload,
        )
        await txn.insert()
        txn_id = str(txn.id)

        for adj_id in adjustment_ids:
            adj = await StockAdjustment.get(adj_id)
            if adj:
                await adj.set({
                    "transaction_id": txn_id,
                    "reference_type": "sale",
                    "reference_id": txn_id,
                })

        if body.customer_id:
            customer = await Customer.get(body.customer_id)
            if customer:
                points_earned = int(body.total / 100)
                new_points = customer.loyalty_points + points_earned - body.loyalty_points_redeemed
                new_spent = customer.total_spent + body.total
                new_tier = _compute_tier(new_spent)
                await customer.set({
                    "loyalty_points": max(0, new_points),
                    "total_spent": new_spent,
                    "membership_tier": new_tier,
                })

        return _to_response(txn)

    except Exception:
        if txn_id:
            txn = await Transaction.get(txn_id)
            if txn:
                await txn.delete()
        if adjustment_ids:
            for adj_id in adjustment_ids:
                adj = await StockAdjustment.get(adj_id)
                if adj:
                    await adj.delete()
        if all_deductions:
            await restock_from_deductions(all_deductions)
        raise


async def update_transaction(txn_id: str, body: "TransactionUpdate") -> TransactionResponse:
    """Update sale metadata (customer, payment, discount). Line items are not changed."""
    from app.schemas.transaction import TransactionUpdate as TxnUpdate

    txn = await Transaction.get(txn_id)
    if not txn:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Transaction not found")

    updates: dict = {}
    data = body.model_dump(exclude_unset=True) if isinstance(body, TxnUpdate) else body

    if "customer_id" in data:
        cid = data["customer_id"]
        if cid:
            customer = await Customer.get(cid)
            if not customer:
                raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Customer not found")
            updates["customer_id"] = cid
            updates["customer_name"] = data.get("customer_name") or customer.name
        else:
            updates["customer_id"] = None
            updates["customer_name"] = data.get("customer_name") or "Walk-In Customer"

    if "customer_name" in data and "customer_id" not in data:
        updates["customer_name"] = data["customer_name"]

    if "payment_method" in data and data["payment_method"] is not None:
        updates["payment_method"] = data["payment_method"]

    if "loyalty_points_redeemed" in data and data["loyalty_points_redeemed"] is not None:
        updates["loyalty_points_redeemed"] = data["loyalty_points_redeemed"]

    if "discount" in data and data["discount"] is not None:
        discount = float(data["discount"])
        line_discount = sum(i.discount * i.quantity for i in txn.items)
        max_discount = txn.subtotal - line_discount
        if discount > max_discount:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                detail="Discount cannot exceed subtotal",
            )
        updates["discount"] = discount
        updates["total"] = round(txn.subtotal - line_discount - discount + txn.tax, 2)

    if not updates:
        return _to_response(txn)

    await txn.set(updates)
    refreshed = await Transaction.get(txn_id)
    return _to_response(refreshed)  # type: ignore[arg-type]


async def void_sale(txn_id: str, reason: str, voided_by: str) -> TransactionResponse:
    """Void a completed sale; restock from stored batch allocations and reverse loyalty."""
    txn = await Transaction.get(txn_id)
    if not txn:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Transaction not found")

    current_status = getattr(txn, "status", TransactionStatus.completed)
    if current_status == TransactionStatus.voided:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Transaction already voided")

    if not reason.strip():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Void reason is required")

    deductions: list[BatchDeduction] = []
    for item in txn.items:
        for alloc in item.batch_allocations:
            deductions.append(
                BatchDeduction(
                    product_id=item.product_id,
                    batch_id=alloc.batch_id,
                    quantity=alloc.quantity,
                    unit_cost=alloc.unit_cost,
                ),
            )
    if deductions:
        await restock_from_deductions(deductions)

    if txn.customer_id:
        customer = await Customer.get(txn.customer_id)
        if customer:
            points_earned = int(txn.total / 100)
            new_points = customer.loyalty_points - points_earned + txn.loyalty_points_redeemed
            new_spent = max(0.0, customer.total_spent - txn.total)
            await customer.set({
                "loyalty_points": max(0, new_points),
                "total_spent": new_spent,
                "membership_tier": _compute_tier(new_spent),
            })

    now = datetime.now(timezone.utc)
    await txn.set({
        "status": TransactionStatus.voided,
        "void_reason": reason.strip(),
        "voided_at": now,
        "voided_by": voided_by,
        "updated_at": now,
    })
    refreshed = await Transaction.get(txn_id)
    return _to_response(refreshed)  # type: ignore[arg-type]
