"""Sale recording — transactions as the sales ledger with stock audit trail."""

from __future__ import annotations

from datetime import datetime, timezone

from app.models.customer import Customer, MembershipTier
from app.models.transaction import Transaction
from app.models.inventory import AdjustmentType, StockAdjustment
from app.schemas.transaction import TransactionCreate, TransactionResponse
from app.services.stock import (
    BatchDeduction,
    check_stock_available,
    deduct_stock_fefo,
    restock_from_deductions,
)


def _compute_tier(total_spent: float) -> MembershipTier:
    if total_spent >= 100000:
        return MembershipTier.platinum
    if total_spent >= 50000:
        return MembershipTier.gold
    if total_spent >= 25000:
        return MembershipTier.silver
    return MembershipTier.bronze


async def _next_txn_number() -> str:
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    prefix = f"TXN-{today}-"
    count = await Transaction.find({"transaction_number": {"$regex": f"^{prefix}"}}).count()
    return f"{prefix}{str(count + 1).zfill(3)}"


def _to_response(txn: Transaction) -> TransactionResponse:
    return TransactionResponse(
        id=str(txn.id),
        transaction_number=txn.transaction_number,
        customer_id=txn.customer_id,
        customer_name=txn.customer_name,
        items=txn.items,
        subtotal=txn.subtotal,
        discount=txn.discount,
        tax=txn.tax,
        loyalty_points_redeemed=txn.loyalty_points_redeemed,
        total=txn.total,
        payment_method=txn.payment_method,
        created_by=txn.created_by,
        cashier_id=txn.cashier_id,
        created_at=txn.created_at.isoformat(),
    )


async def record_sale(body: TransactionCreate, cashier_id: str | None = None) -> TransactionResponse:
    for item in body.items:
        await check_stock_available(item.product_id, item.quantity)

    txn_number = await _next_txn_number()
    all_deductions: list[BatchDeduction] = []
    adjustment_ids: list[str] = []
    txn_id: str | None = None

    try:
        for item in body.items:
            deductions = await deduct_stock_fefo(item.product_id, item.quantity)
            all_deductions.extend(deductions)

            for d in deductions:
                adj = StockAdjustment(
                    product_id=d.product_id,
                    batch_id=d.batch_id,
                    transaction_id=None,
                    type=AdjustmentType.sale,
                    quantity=-d.quantity,
                    reason=f"Sale {txn_number}",
                    created_by=body.created_by,
                )
                await adj.insert()
                adjustment_ids.append(str(adj.id))

        txn = Transaction(
            transaction_number=txn_number,
            cashier_id=cashier_id,
            **body.model_dump(),
        )
        await txn.insert()
        txn_id = str(txn.id)

        for adj_id in adjustment_ids:
            adj = await StockAdjustment.get(adj_id)
            if adj:
                await adj.set({"transaction_id": txn_id})

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
