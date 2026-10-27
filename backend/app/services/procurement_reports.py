"""Procurement, supplier accounts payable aging, returns, and inventory health service."""

from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from math import ceil
from typing import Any

from app.models.inventory import InventoryBatch
from app.models.product import Product, ProductStatus
from app.models.purchase_order import POStatus, PurchaseOrder
from app.models.purchase_return import PurchaseReturn, PurchaseReturnStatus
from app.models.supplier import Supplier
from app.schemas.reports import (
    APAgingBuckets,
    CategoryValuationRow,
    DeadStockRow,
    ExpiredStockRow,
    ExpiryBatchRow,
    InventoryHealthReport,
    LargeDiscountRow,
    LossAuditReport,
    MissingDayCloseRow,
    NegativeMarginProduct,
    PurchaseReturnRow,
    PurchasingPayablesReport,
    ReorderCandidateRow,
    SupplierLedgerRow,
    VoidedTransactionRow,
)
from app.services.reporting import (
    aggregate_batch_inventory_value,
    aggregate_items_sold_with_margin,
    aggregate_last_sale_before,
    aggregate_sold_product_ids,
    build_product_cache,
    collect_product_ids,
    days_until,
    fetch_transactions,
    line_cogs,
    line_discount,
    line_gross,
)
from app.services.stock import classify_on_hand_stock, get_current_stock_batch
from app.services.time_nepal import NPT, to_npt


def _bucket_ap_amount(age_days: int, amount: float, buckets: APAgingBuckets) -> None:
    if age_days <= 30:
        buckets.current_0_30 += amount
    elif age_days <= 60:
        buckets.aging_31_60 += amount
    elif age_days <= 90:
        buckets.aging_61_90 += amount
    else:
        buckets.over_90 += amount
    buckets.total_ap += amount


async def generate_purchasing_payables_report(
    start: datetime,
    end: datetime,
    date_basis: str = "received",
) -> PurchasingPayablesReport:
    """Generate supplier procurement ledger, AP aging analysis, and purchase returns."""
    start_str = to_npt(start).strftime("%Y-%m-%d")
    end_str = to_npt(end).strftime("%Y-%m-%d")
    today_npt = datetime.now(NPT).date()

    # 1. Fetch eligible POs based on date_basis
    if date_basis == "received":
        pos = await PurchaseOrder.find({
            "$and": [
                {"status": {"$nin": [POStatus.draft.value, POStatus.cancelled.value]}},
                {
                    "$or": [
                        {"received_date": {"$gte": start_str, "$lte": end_str}},
                        {
                            "received_date": None,
                            "created_at": {"$gte": start, "$lte": end},
                        },
                    ]
                },
            ]
        }).to_list()
    else:  # "ordered"
        pos = await PurchaseOrder.find({
            "created_at": {"$gte": start, "$lte": end},
            "status": {"$nin": [POStatus.draft.value, POStatus.cancelled.value]},
        }).to_list()

    # Load suppliers for phone/PAN details
    supplier_ids = {po.supplier_id for po in pos if po.supplier_id}
    suppliers_list = await Supplier.find().to_list()
    supplier_map = {str(s.id): s for s in suppliers_list}

    # Also fetch all active POs across the store to build global AP aging
    all_active_pos = await PurchaseOrder.find({
        "status": {"$in": [POStatus.ordered.value, POStatus.partial.value, POStatus.received.value]}
    }).to_list()

    # Global AP aging across all active POs
    global_ap_aging = APAgingBuckets()
    for po in all_active_pos:
        unpaid = max(0.0, float(po.total_amount) - float(po.amount_paid))
        if unpaid > 0.009:
            if po.received_date and str(po.received_date).strip():
                try:
                    ref_date = date.fromisoformat(str(po.received_date)[:10])
                except Exception:
                    ref_date = to_npt(po.created_at).date()
            else:
                ref_date = to_npt(po.created_at).date()
            age_days = (today_npt - ref_date).days
            _bucket_ap_amount(age_days, unpaid, global_ap_aging)

    # Round global buckets
    global_ap_aging.current_0_30 = round(global_ap_aging.current_0_30, 2)
    global_ap_aging.aging_31_60 = round(global_ap_aging.aging_31_60, 2)
    global_ap_aging.aging_61_90 = round(global_ap_aging.aging_61_90, 2)
    global_ap_aging.over_90 = round(global_ap_aging.over_90, 2)
    global_ap_aging.total_ap = round(global_ap_aging.total_ap, 2)

    # 2. Supplier Ledger grouping
    supplier_groups: dict[str, dict[str, Any]] = defaultdict(
        lambda: {
            "name": "",
            "orders": 0,
            "gross": 0.0,
            "discounts": 0.0,
            "charges": 0.0,
            "net": 0.0,
            "paid": 0.0,
            "unpaid": 0.0,
            "aging": APAgingBuckets(),
        }
    )

    gross_purchases = 0.0
    purchase_discounts = 0.0
    additional_charges = 0.0
    net_purchases = 0.0
    total_amount_paid = 0.0

    for po in pos:
        sid = po.supplier_id or "unknown"
        sname = po.supplier_name or "Unknown Supplier"
        g = supplier_groups[sid]
        g["name"] = sname
        g["orders"] += 1

        po_sub = float(po.subtotal or 0.0)
        po_disc = float(po.discount or 0.0)
        po_chg = float(po.additional_charges or 0.0)
        po_tot = float(po.total_amount or 0.0)
        po_pd = float(po.amount_paid or 0.0)
        po_unpaid = max(0.0, po_tot - po_pd)

        gross_purchases += po_sub
        purchase_discounts += po_disc
        additional_charges += po_chg
        net_purchases += po_tot
        total_amount_paid += po_pd

        g["gross"] += po_sub
        g["discounts"] += po_disc
        g["charges"] += po_chg
        g["net"] += po_tot
        g["paid"] += po_pd
        g["unpaid"] += po_unpaid

        if po_unpaid > 0.009:
            if po.received_date and str(po.received_date).strip():
                try:
                    ref_d = date.fromisoformat(str(po.received_date)[:10])
                except Exception:
                    ref_d = to_npt(po.created_at).date()
            else:
                ref_d = to_npt(po.created_at).date()
            age_d = (today_npt - ref_d).days
            _bucket_ap_amount(age_d, po_unpaid, g["aging"])

    supplier_ledger: list[SupplierLedgerRow] = []
    for sid, v in sorted(supplier_groups.items(), key=lambda x: x[1]["net"], reverse=True):
        sup_doc = supplier_map.get(sid)
        phone = sup_doc.phone if sup_doc else ""
        pan = getattr(sup_doc, "pan_number", "") or ""

        aging_b = v["aging"]
        aging_b.current_0_30 = round(aging_b.current_0_30, 2)
        aging_b.aging_31_60 = round(aging_b.aging_31_60, 2)
        aging_b.aging_61_90 = round(aging_b.aging_61_90, 2)
        aging_b.over_90 = round(aging_b.over_90, 2)
        aging_b.total_ap = round(aging_b.total_ap, 2)

        supplier_ledger.append(
            SupplierLedgerRow(
                supplier_id=sid,
                supplier_name=v["name"],
                pan_number=pan,
                phone=phone,
                order_count=v["orders"],
                gross_purchases=round(v["gross"], 2),
                discounts=round(v["discounts"], 2),
                additional_charges=round(v["charges"], 2),
                net_purchases=round(v["net"], 2),
                amount_paid=round(v["paid"], 2),
                outstanding_balance=round(v["unpaid"], 2),
                aging=aging_b,
            )
        )

    # 3. Purchase Returns & Open Supplier Receivables
    prs = await PurchaseReturn.find({
        "$or": [
            {"return_date": {"$gte": start_str, "$lte": end_str}},
            {"created_at": {"$gte": start, "$lte": end}},
        ]
    }).to_list()

    all_open_prs = await PurchaseReturn.find({
        "status": PurchaseReturnStatus.requested.value
    }).to_list()
    total_supplier_receivables = sum(
        max(0.0, r.total_amount - (r.amount_received + r.write_off_amount))
        for r in all_open_prs
    )

    returns_ledger: list[PurchaseReturnRow] = []
    total_pr_value = 0.0
    total_pr_refunds = 0.0

    for pr in prs:
        pending = (
            max(0.0, pr.total_amount - (pr.amount_received + pr.write_off_amount))
            if pr.status == PurchaseReturnStatus.requested
            else 0.0
        )
        total_pr_value += pr.total_amount
        total_pr_refunds += pr.amount_received

        returns_ledger.append(
            PurchaseReturnRow(
                return_id=str(pr.id),
                return_number=pr.return_number,
                order_number=pr.order_number or "",
                supplier_id=pr.supplier_id,
                supplier_name=pr.supplier_name,
                return_date=pr.return_date or to_npt(pr.created_at).strftime("%Y-%m-%d"),
                items_count=len(pr.items or []),
                total_amount=round(pr.total_amount, 2),
                amount_received=round(pr.amount_received, 2),
                write_off_amount=round(pr.write_off_amount, 2),
                pending_receivable=round(pending, 2),
                status=pr.status.value if hasattr(pr.status, "value") else str(pr.status),
                settlement_type=(
                    pr.settlement_type.value
                    if hasattr(pr.settlement_type, "value")
                    else str(pr.settlement_type)
                ),
            )
        )

    returns_ledger.sort(key=lambda x: x.total_amount, reverse=True)

    return PurchasingPayablesReport(
        period_start=start_str,
        period_end=end_str,
        gross_purchases=round(gross_purchases, 2),
        purchase_discounts=round(purchase_discounts, 2),
        additional_charges=round(additional_charges, 2),
        net_purchases=round(net_purchases, 2),
        total_amount_paid=round(total_amount_paid, 2),
        total_outstanding_ap=round(global_ap_aging.total_ap, 2),
        ap_aging=global_ap_aging,
        supplier_ledger=supplier_ledger,
        total_purchase_returns_value=round(total_pr_value, 2),
        total_return_refunds_received=round(total_pr_refunds, 2),
        total_supplier_receivables=round(total_supplier_receivables, 2),
        returns_ledger=returns_ledger,
    )


async def generate_inventory_health_report(
    stock_filter: str = "both",
    expiry_days: int = 30,
    dead_days: int = 30,
) -> InventoryHealthReport:
    """Generate category valuation, reorder action candidates, near-expiry batches, and dead stock."""
    # 1. Fetch active products
    products = await Product.find(Product.is_active == True).to_list()  # noqa: E712
    product_ids = [str(p.id) for p in products]
    product_map = {str(p.id): p for p in products}

    # Current stock on hand
    stock_map = await get_current_stock_batch(product_ids)

    # 2. Batch valuation per category
    batch_pipeline = [
        {"$match": {"quantity": {"$gt": 0}}},
        {
            "$group": {
                "_id": "$product_id",
                "units": {"$sum": "$quantity"},
                "value": {"$sum": {"$multiply": ["$quantity", "$unit_cost"]}},
            }
        },
    ]
    batch_rows = await InventoryBatch.aggregate(batch_pipeline).to_list()
    batch_by_pid: dict[str, dict[str, float]] = {
        row["_id"]: {"units": int(row["units"]), "value": float(row["value"])}
        for row in batch_rows
    }

    category_valuation_map: dict[str, dict[str, Any]] = defaultdict(
        lambda: {"skus": 0, "units": 0, "value": 0.0}
    )

    total_inv_val = 0.0
    for product in products:
        pid = str(product.id)
        cat = product.category or "Other"
        b_info = batch_by_pid.get(pid, {"units": 0, "value": 0.0})
        b_units = b_info["units"]
        b_val = b_info["value"]

        # If batch value is 0 but stock exists, fallback to cost_price
        if b_val <= 0 and b_units > 0:
            b_val = b_units * product.cost_price

        category_valuation_map[cat]["skus"] += 1
        category_valuation_map[cat]["units"] += b_units
        category_valuation_map[cat]["value"] += b_val
        total_inv_val += b_val

    category_valuation_rows: list[CategoryValuationRow] = []
    for cat, v in sorted(category_valuation_map.items(), key=lambda x: x[1]["value"], reverse=True):
        share = (v["value"] / total_inv_val * 100) if total_inv_val else 0.0
        category_valuation_rows.append(
            CategoryValuationRow(
                category=cat,
                sku_count=v["skus"],
                total_units=v["units"],
                batch_valuation=round(v["value"], 2),
                valuation_share_pct=round(share, 1),
            )
        )

    # 3. Reorder Candidates
    reorder_candidates: list[ReorderCandidateRow] = []
    low_count = 0
    out_count = 0

    for product in products:
        pid = str(product.id)
        stock = stock_map.get(pid, 0)
        c = classify_on_hand_stock(stock, product.low_stock_threshold)
        if c == "out":
            out_count += 1
        elif c == "low":
            low_count += 1

        if stock_filter == "out" and c != "out":
            continue
        elif stock_filter == "low" and c != "low":
            continue
        elif stock_filter == "both" and c not in ("out", "low"):
            continue

        target_stock = max(product.low_stock_threshold * 2, 5)
        units_needed = max(1, target_stock - stock)
        cost_est = round(units_needed * product.cost_price, 2)

        reorder_candidates.append(
            ReorderCandidateRow(
                product_id=pid,
                name=product.name,
                sku=product.sku,
                category=product.category or "Other",
                stock=stock,
                low_stock_threshold=product.low_stock_threshold,
                status=c,
                cost_price=product.cost_price,
                selling_price=product.selling_price,
                units_needed=units_needed,
                estimated_reorder_cost=cost_est,
            )
        )

    reorder_candidates.sort(key=lambda x: x.estimated_reorder_cost, reverse=True)

    # 4. Near-Expiry & Expired Batches
    today_str = date.today().isoformat()
    cutoff_str = (date.today() + timedelta(days=expiry_days)).isoformat()
    near_batches = (
        await InventoryBatch.find(
            InventoryBatch.quantity > 0,
            {"expiry_date": {"$ne": None, "$nin": [None, ""], "$lte": cutoff_str}},
        )
        .sort("+expiry_date")
        .to_list()
    )

    expiry_rows: list[ExpiryBatchRow] = []
    for batch in near_batches:
        prod = product_map.get(batch.product_id)
        if not prod:
            continue
        val_at_risk = round(batch.quantity * batch.unit_cost, 2)
        expiry_rows.append(
            ExpiryBatchRow(
                product_id=batch.product_id,
                product_name=prod.name,
                sku=prod.sku,
                category=prod.category or "Other",
                batch_number=batch.batch_number,
                quantity=batch.quantity,
                unit_cost=batch.unit_cost,
                stock_value_at_risk=val_at_risk,
                expiry_date=batch.expiry_date,
                days_until_expiry=days_until(batch.expiry_date),
            )
        )

    # Count of products with on-hand stock that have NO expiry date configured
    batches_with_valid_expiry = await InventoryBatch.find(
        InventoryBatch.quantity > 0,
        {"expiry_date": {"$ne": None, "$nin": [None, ""]}},
    ).to_list()
    pids_with_expiry = {b.product_id for b in batches_with_valid_expiry}
    products_with_stock_ids = [str(p.id) for p in products if stock_map.get(str(p.id), 0) > 0]
    untracked_expiry_count = len([pid for pid in products_with_stock_ids if pid not in pids_with_expiry])

    # 5. Dead Stock Items
    now_utc = datetime.now(timezone.utc)
    dead_cutoff = now_utc - timedelta(days=dead_days)
    recently_sold_pids = await aggregate_sold_product_ids(dead_cutoff)

    products_with_stock = [p for p in products if stock_map.get(str(p.id), 0) > 0]
    dead_pids = [str(p.id) for p in products_with_stock if str(p.id) not in recently_sold_pids]

    dead_stock_rows: list[DeadStockRow] = []
    if dead_pids:
        last_sales = await aggregate_last_sale_before(dead_pids, dead_cutoff)
        for p in products_with_stock:
            pid = str(p.id)
            if pid not in dead_pids:
                continue
            stock = stock_map.get(pid, 0)
            if pid in last_sales:
                st = last_sales[pid]
                if st.tzinfo is None:
                    st = st.replace(tzinfo=timezone.utc)
                days_no_sale = max(0, (now_utc - st).days)
            else:
                days_no_sale = dead_days

            dead_stock_rows.append(
                DeadStockRow(
                    product_id=pid,
                    product_name=p.name,
                    sku=p.sku,
                    category=p.category or "Other",
                    stock=stock,
                    cost_price=p.cost_price,
                    stock_value=round(stock * p.cost_price, 2),
                    days_without_sale=days_no_sale,
                    product_status=p.status.value if hasattr(p, "status") and p.status else "active",
                )
            )

    dead_stock_rows.sort(key=lambda x: x.stock_value, reverse=True)

    # 6. Inventory Turnover Rate & Days Sales of Inventory
    # Compute COGS for last 365 days to derive annualised turnover
    from datetime import timezone as _tz
    from app.models.transaction import Transaction as Tx, TransactionStatus as TxSt
    one_year_ago = datetime.now(timezone.utc) - timedelta(days=365)
    annual_txns = await Tx.find({
        "created_at": {"$gte": one_year_ago},
        "status": {"$ne": TxSt.voided.value},
    }).to_list()
    annual_cogs = 0.0
    ann_product_ids = {item.product_id for t in annual_txns for item in t.items}
    ann_product_cache = await build_product_cache(ann_product_ids)
    for t in annual_txns:
        for item in t.items:
            from app.services.reporting import line_cogs as _lc
            annual_cogs += _lc(item, ann_product_cache.get(item.product_id))
    avg_inventory = total_inv_val if total_inv_val > 0 else 1.0
    turnover_rate = round(annual_cogs / avg_inventory, 2) if avg_inventory > 0 else 0.0
    dsi = round(365 / turnover_rate, 1) if turnover_rate > 0 else 0.0

    return InventoryHealthReport(
        total_skus=len(products),
        low_stock_count=low_count,
        out_of_stock_count=out_count,
        expiring_count=len(expiry_rows),
        dead_stock_count=len(dead_stock_rows),
        total_inventory_value=round(total_inv_val, 2),
        inventory_turnover_rate=turnover_rate,
        days_sales_of_inventory=dsi,
        valuation_by_category=category_valuation_rows,
        reorder_candidates=reorder_candidates,
        near_expiry_batches=expiry_rows,
        dead_stock_items=dead_stock_rows,
        untracked_expiry_count=untracked_expiry_count,
    )


async def generate_loss_audit_report(
    start: datetime,
    end: datetime,
    large_discount_threshold_pct: float = 20.0,
) -> LossAuditReport:
    """Generate Loss & Anomaly Audit: voids, large discounts, negative margins, expired stock, missing day closes."""
    from app.models.day_close import DayClose
    from app.models.transaction import Transaction, TransactionStatus

    start_str = to_npt(start).strftime("%Y-%m-%d")
    end_str = to_npt(end).strftime("%Y-%m-%d")
    today_npt = datetime.now(NPT).date()

    # 1. Voided Transactions in period
    voided_txns = await Transaction.find({
        "created_at": {"$gte": start, "$lte": end},
        "status": TransactionStatus.voided.value,
    }).to_list()

    voided_rows: list[VoidedTransactionRow] = []
    total_void_amount = 0.0
    for txn in voided_txns:
        txn_date = to_npt(txn.created_at).strftime("%Y-%m-%d")
        gross = sum(float(item.price) * float(item.quantity) for item in txn.items)
        total_void_amount += gross
        voided_rows.append(VoidedTransactionRow(
            transaction_number=txn.transaction_number,
            date=txn_date,
            cashier=txn.created_by or "Unknown",
            amount=round(gross, 2),
            void_reason=txn.void_reason or "",
        ))
    voided_rows.sort(key=lambda x: x.amount, reverse=True)

    # 2. Large Discount Transactions (discount % > threshold)
    completed_txns = await Transaction.find({
        "created_at": {"$gte": start, "$lte": end},
        "status": {"$ne": TransactionStatus.voided.value},
    }).to_list()

    large_disc_rows: list[LargeDiscountRow] = []
    total_large_disc_amount = 0.0
    for txn in completed_txns:
        gross = sum(float(item.price) * float(item.quantity) for item in txn.items)
        item_disc = sum(float(item.discount) * float(item.quantity) for item in txn.items)
        bill_disc = float(getattr(txn, "discount", 0.0) or 0.0)
        total_disc = item_disc + bill_disc
        disc_pct = (total_disc / gross * 100) if gross > 0 else 0.0
        if disc_pct >= large_discount_threshold_pct:
            txn_date = to_npt(txn.created_at).strftime("%Y-%m-%d")
            total_large_disc_amount += total_disc
            large_disc_rows.append(LargeDiscountRow(
                transaction_number=txn.transaction_number,
                date=txn_date,
                cashier=txn.created_by or "Unknown",
                gross_sales=round(gross, 2),
                total_discount=round(total_disc, 2),
                discount_pct=round(disc_pct, 1),
                net_total=round(txn.total, 2),
            ))
    large_disc_rows.sort(key=lambda x: x.discount_pct, reverse=True)

    # 3. Negative-Margin Products (net revenue < COGS)
    product_ids = {item.product_id for t in completed_txns for item in t.items}
    product_cache = await build_product_cache(product_ids)
    items_with_margin = aggregate_items_sold_with_margin(completed_txns, product_cache)
    neg_margin_rows: list[NegativeMarginProduct] = []
    total_neg_loss = 0.0
    for row in items_with_margin:
        if row.gross_profit < 0:
            total_neg_loss += abs(row.gross_profit)
            neg_margin_rows.append(NegativeMarginProduct(
                product_id=row.product_id,
                name=row.name,
                sku=row.sku,
                category=row.category,
                units_sold=row.quantity_sold,
                net_revenue=row.net_revenue,
                total_cogs=row.total_cogs,
                gross_profit=row.gross_profit,
                gross_margin_pct=row.gross_margin_pct,
            ))
    neg_margin_rows.sort(key=lambda x: x.gross_profit)

    # 4. Expired Stock Still In Inventory (past expiry date, qty > 0)
    today_str = date.today().isoformat()
    expired_batches = await InventoryBatch.find(
        InventoryBatch.quantity > 0,
        {"expiry_date": {"$lt": today_str, "$exists": True}},
    ).to_list()
    exp_rows: list[ExpiredStockRow] = []
    total_exp_value = 0.0
    exp_product_ids = {b.product_id for b in expired_batches}
    exp_product_cache = await build_product_cache(exp_product_ids)
    for batch in expired_batches:
        if not batch.expiry_date:
            continue
        prod = exp_product_cache.get(batch.product_id)
        write_off = round(batch.quantity * batch.unit_cost, 2)
        total_exp_value += write_off
        exp_rows.append(ExpiredStockRow(
            product_id=batch.product_id,
            product_name=prod.name if prod else "Unknown",
            sku=prod.sku if prod else "",
            category=prod.category if prod else "Other",
            batch_number=batch.batch_number,
            quantity=batch.quantity,
            unit_cost=batch.unit_cost,
            write_off_value=write_off,
            expiry_date=batch.expiry_date,
        ))
    exp_rows.sort(key=lambda x: x.write_off_value, reverse=True)

    # 5. Missing Day Closes (each day in range without a DayClose record)
    existing_closes = await DayClose.find({
        "date": {"$gte": start_str, "$lte": end_str}
    }).to_list()
    closed_dates = {dc.date for dc in existing_closes}
    missing_closes: list[MissingDayCloseRow] = []
    DAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    cur = to_npt(start).date()
    end_d = to_npt(end).date()
    # Don't flag today as missing
    check_until = min(end_d, today_npt - timedelta(days=1))
    while cur <= check_until:
        day_str = cur.isoformat()
        if day_str not in closed_dates:
            day_label = f"{DAY_SHORT[cur.weekday()]} {cur.strftime('%d %b')}"
            missing_closes.append(MissingDayCloseRow(date=day_str, day_label=day_label))
        cur += timedelta(days=1)

    return LossAuditReport(
        period_start=start_str,
        period_end=end_str,
        total_void_count=len(voided_rows),
        total_void_amount=round(total_void_amount, 2),
        voided_transactions=voided_rows,
        large_discount_threshold_pct=large_discount_threshold_pct,
        large_discount_count=len(large_disc_rows),
        total_large_discount_amount=round(total_large_disc_amount, 2),
        large_discount_transactions=large_disc_rows,
        negative_margin_product_count=len(neg_margin_rows),
        total_loss_on_neg_margin=round(total_neg_loss, 2),
        negative_margin_products=neg_margin_rows,
        expired_stock_count=len(exp_rows),
        expired_stock_write_off_value=round(total_exp_value, 2),
        expired_stock_items=exp_rows,
        missing_day_close_count=len(missing_closes),
        missing_day_closes=missing_closes,
    )
