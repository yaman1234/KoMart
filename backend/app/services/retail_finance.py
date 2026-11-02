"""Retail financial analytics and accounting calculation engine.

Handles:
- Trading Profit & Loss (P&L) waterfall with OpEx/CapEx/Supplier separation
- Cash Flow statement and Cash-to-Profit Bridge reconciliation
- Sales & Merchandising category contribution and tender mix
- Tax & VAT summary (13% Output VAT and paisa round-offs)
- Working Capital indicators (Inventory Valuation, Accounts Payable, Supplier Receivables)
"""

from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from typing import Any

from app.models.expense import Expense
from app.models.product import Product
from app.models.purchase_order import POStatus, PurchaseOrder
from app.models.purchase_return import PurchaseReturn, PurchaseReturnStatus
from app.models.transaction import Transaction
from app.models.wallet_ledger import (
    Wallet,
    WalletDirection,
    WalletEntryType,
    WalletLedgerEntry,
)  # Wallet used by WC snapshots
from app.schemas.reports import (
    APAgingBuckets,
    CashFlowDailyPoint,
    CashFlowInflows,
    CashFlowMovementRow,
    CashFlowOutflows,
    CashFlowStatement,
    CashToProfitBridge,
    CategoryContribution,
    DailySalesPerformance,
    ExpenseByCategory,
    ExecutiveFinancialSummary,
    IncomeVsExpensesSummary,
    ReceivablesVsPayablesSummary,
    SalesPerformanceReport,
    TaxVatSummary,
    TenderMixItem,
    TopCreditorItem,
    TradingPnLWaterfall,
    WalletMovementSummary,
    WorkingCapitalSummary,
)
from app.services.expense_helpers import is_purchase_order_payment, is_setup_investment
from app.services.payment_methods import normalize_payment_method
from app.services.reporting import (
    aggregate_batch_inventory_value,
    aggregate_inventory_shrinkage,
    build_last_purchase_cost_cache,
    build_product_cache,
    collect_product_ids,
    fetch_transactions,
    line_cogs,
    line_discount,
    line_gross,
    line_revenue,
)
from app.services.time_nepal import NPT, to_npt
from app.services.wallet_ledger import (
    all_balances,
    cash_till_snapshot,
    custody_total_as_of,
    current_wallet_balance,
    ensure_backfill,
    ledger_net,
    open_custody_total,
    sum_cash_till_variances,
    wallet_balance_as_of,
)


async def calculate_trading_pnl(
    start: datetime,
    end: datetime,
    txns: list[Transaction] | None = None,
    expenses: list[Expense] | None = None,
) -> tuple[TradingPnLWaterfall, list[Transaction], list[Expense]]:
    """Calculate the retail Trading Profit & Loss statement with strict OpEx separation."""
    if txns is None:
        txns = await fetch_transactions(start, end)

    start_str = to_npt(start).strftime("%Y-%m-%d")
    end_str = to_npt(end).strftime("%Y-%m-%d")

    if expenses is None:
        expenses = await Expense.find(
            {"date": {"$gte": start_str, "$lte": end_str}}
        ).to_list()

    product_ids = collect_product_ids(txns)
    product_cache = await build_product_cache(product_ids)
    last_cost_cache = await build_last_purchase_cost_cache(product_ids)

    gross_sales = 0.0
    item_markdowns = 0.0
    bill_discounts = 0.0
    total_cogs = 0.0
    zero_cost_line_count = 0

    for txn in txns:
        txn_gross = sum(line_gross(item) for item in txn.items)
        txn_item_disc = sum(line_discount(item) for item in txn.items)
        txn_bill_disc = float(getattr(txn, "discount", 0.0) or 0.0)

        txn_cogs = float(getattr(txn, "total_cost", 0.0) or 0.0)
        if txn_cogs <= 0:
            line_costs = []
            for item in txn.items:
                cost = line_cogs(
                    item,
                    product_cache.get(item.product_id),
                    last_cost_cache.get(item.product_id),
                )
                if cost <= 0:
                    zero_cost_line_count += 1
                line_costs.append(cost)
            txn_cogs = sum(line_costs)
        else:
            # Still count zero-cost lines for phantom-margin visibility when total_cost was stamped
            for item in txn.items:
                unit = float(getattr(item, "unit_cost", 0.0) or 0.0)
                if unit <= 0 and not (
                    product_cache.get(item.product_id)
                    and float(getattr(product_cache[item.product_id], "cost_price", 0) or 0) > 0
                ) and not last_cost_cache.get(item.product_id):
                    zero_cost_line_count += 1

        gross_sales += txn_gross
        item_markdowns += txn_item_disc
        bill_discounts += txn_bill_disc
        total_cogs += txn_cogs

    total_discounts = item_markdowns + bill_discounts
    net_sales = max(0.0, gross_sales - total_discounts)
    gross_profit = net_sales - total_cogs
    gross_margin_pct = (gross_profit / net_sales * 100) if net_sales else 0.0

    total_expenses = 0.0
    setup_investment = 0.0
    po_paid = 0.0

    for exp in expenses:
        total_expenses += exp.amount
        if is_setup_investment(exp):
            setup_investment += exp.amount
        elif is_purchase_order_payment(exp):
            po_paid += exp.amount

    inventory_shrinkage = await aggregate_inventory_shrinkage(start, end)

    # Operating expenses exclude setup investment (CapEx) and PO payments (inventory)
    operating_expenses = max(0.0, total_expenses - setup_investment - po_paid)
    # Shrinkage is a trading deduction before EBIT (plan §4)
    operating_profit = gross_profit - operating_expenses - inventory_shrinkage
    operating_margin_pct = (operating_profit / net_sales * 100) if net_sales else 0.0
    net_profit = operating_profit - setup_investment

    waterfall = TradingPnLWaterfall(
        gross_sales=round(gross_sales, 2),
        item_markdowns=round(item_markdowns, 2),
        bill_discounts=round(bill_discounts, 2),
        total_discounts=round(total_discounts, 2),
        net_sales=round(net_sales, 2),
        total_cogs=round(total_cogs, 2),
        gross_profit=round(gross_profit, 2),
        gross_margin_pct=round(gross_margin_pct, 1),
        operating_expenses=round(operating_expenses, 2),
        inventory_shrinkage=round(inventory_shrinkage, 2),
        operating_profit=round(operating_profit, 2),
        operating_margin_pct=round(operating_margin_pct, 1),
        setup_investment=round(setup_investment, 2),
        net_profit=round(net_profit, 2),
        zero_cost_line_count=zero_cost_line_count,
    )
    return waterfall, txns, expenses


async def calculate_tax_vat_summary(txns: list[Transaction]) -> TaxVatSummary:
    """Calculate 13% Output VAT, Taxable vs Exempt sales, and Round-Offs."""
    total_tax = 0.0
    total_round_off = 0.0
    for txn in txns:
        total_tax += float(getattr(txn, "tax", 0.0) or 0.0)
        total_round_off += float(getattr(txn, "round_off", 0.0) or 0.0)

    # In Nepal, standard VAT is 13%. Taxable sales base = VAT / 0.13
    taxable_sales = round(total_tax / 0.13, 2) if total_tax > 0 else 0.0
    total_net = sum(
        sum(line_revenue(i) for i in t.items) - float(getattr(t, "discount", 0) or 0)
        for t in txns
    )
    exempt_sales = max(0.0, round(total_net - taxable_sales, 2))

    return TaxVatSummary(
        taxable_sales=taxable_sales,
        exempt_sales=exempt_sales,
        output_vat_13=round(total_tax, 2),
        round_off=round(total_round_off, 2),
    )


async def _ap_ar_live() -> tuple[float, float]:
    active_pos = await PurchaseOrder.find(
        {"status": {"$in": [POStatus.ordered.value, POStatus.partial.value, POStatus.received.value]}}
    ).to_list()
    accounts_payable = sum(max(0.0, po.total_amount - po.amount_paid) for po in active_pos)

    open_returns = await PurchaseReturn.find(
        {"status": PurchaseReturnStatus.requested.value}
    ).to_list()
    accounts_receivable = sum(
        max(0.0, r.total_amount - (r.amount_received + r.write_off_amount))
        for r in open_returns
    )
    return round(accounts_payable, 2), round(accounts_receivable, 2)


async def calculate_working_capital_indicators(
    *,
    as_of: str | None = None,
    snapshot_mode: str = "live",
) -> WorkingCapitalSummary:
    """
    Working capital snapshot.

    - live: current wallet/custody balances (today)
    - closing: wallet/custody as of `as_of` (period end)
    Inventory valuation and AP/AR remain live (point-in-time liabilities / stock).
    """
    inventory_value = await aggregate_batch_inventory_value()
    accounts_payable, accounts_receivable = await _ap_ar_live()

    mode = "closing" if snapshot_mode == "closing" and as_of else "live"
    as_of_date = as_of or datetime.now(NPT).strftime("%Y-%m-%d")

    bank_bal = 0.0
    esewa_bal = 0.0
    till_bal = 0.0
    till_expected = 0.0
    till_variance = 0.0
    staff_bal = 0.0

    try:
        if mode == "closing":
            bank_bal = await wallet_balance_as_of(Wallet.bank, as_of_date)
            esewa_bal = await wallet_balance_as_of(Wallet.esewa, as_of_date)
            till_bal, till_expected, till_variance = await cash_till_snapshot(as_of_date)
            staff_bal = await custody_total_as_of(as_of_date)
        else:
            balances = await all_balances()
            bank_bal = round(float(balances.get("bank", 0.0) or 0.0), 2)
            esewa_bal = round(float(balances.get("esewa", 0.0) or 0.0), 2)
            today_str = datetime.now(NPT).strftime("%Y-%m-%d")
            till_bal, till_expected, till_variance = await cash_till_snapshot(today_str)
            # Prefer ledger cash for live "accounts cash" when no counted close yet
            if till_variance == 0.0:
                cash_ledger = await current_wallet_balance(Wallet.cash)
                till_bal = round(float(cash_ledger or 0.0), 2)
                till_expected = round(float(balances.get("cash_till_expected", till_expected) or till_expected), 2)
            staff_bal = round(float(await open_custody_total() or 0.0), 2)
            as_of_date = today_str
    except Exception:
        pass

    bank_and_digital = round(bank_bal + esewa_bal, 2)
    total_liquid = round(bank_and_digital + till_bal + staff_bal, 2)
    total_wc = round(total_liquid + inventory_value, 2)
    net_wc = round((total_wc + accounts_receivable) - accounts_payable, 2)
    cov_ratio = round(total_liquid / accounts_payable, 2) if accounts_payable > 0 else (99.0 if total_liquid > 0 else 0.0)

    return WorkingCapitalSummary(
        inventory_value=round(inventory_value, 2),
        accounts_payable=accounts_payable,
        accounts_receivable=accounts_receivable,
        bank_balance=bank_bal,
        esewa_balance=esewa_bal,
        bank_and_digital_total=bank_and_digital,
        cash_till_balance=till_bal,
        cash_till_expected=till_expected,
        till_variance=till_variance,
        cash_with_staff=staff_bal,
        total_liquid_cash=total_liquid,
        total_working_capital=total_wc,
        net_working_capital=net_wc,
        cash_coverage_ratio=cov_ratio,
        as_of_date=as_of_date,
        snapshot_mode=mode,
    )


async def calculate_cash_flow_statement(
    start: datetime,
    end: datetime,
    pnl: TradingPnLWaterfall,
    txns: list[Transaction],
    expenses: list[Expense],
) -> tuple[CashFlowStatement, CashToProfitBridge]:
    """Build multi-wallet cash flow statement and exact Cash-to-Profit Bridge."""
    await ensure_backfill()

    start_str = to_npt(start).strftime("%Y-%m-%d")
    end_str = to_npt(end).strftime("%Y-%m-%d")

    # Fetch wallet ledger entries in range
    entries = await WalletLedgerEntry.find({
        "date": {"$gte": start_str, "$lte": end_str}
    }).to_list()

    sales_by_wallet: dict[str, float] = {"cash": 0.0, "bank": 0.0, "esewa": 0.0}
    supplier_refunds = 0.0
    transfers_in = 0.0
    adjustments_in = 0.0
    other_in = 0.0

    opex_paid = 0.0
    supplier_po_payments = 0.0
    transfers_out = 0.0
    adjustments_out = 0.0
    other_out = 0.0

    wallet_inflows: dict[str, float] = defaultdict(float)
    wallet_outflows: dict[str, float] = defaultdict(float)

    # Daily chart series (initialize full range so gaps show as zeros)
    daily_stats: dict[str, dict[str, float]] = {}
    current = to_npt(start).date()
    end_d = to_npt(end).date()
    while current <= end_d:
        daily_stats[current.strftime("%Y-%m-%d")] = {"inflows": 0.0, "outflows": 0.0}
        current += timedelta(days=1)

    movements: list[CashFlowMovementRow] = []
    MOVEMENTS_CAP = 2000

    has_ledger_sales = False
    for entry in entries:
        w_key = str(getattr(entry.wallet, "value", entry.wallet))
        amt = float(entry.amount or 0.0)
        et = str(getattr(entry.entry_type, "value", entry.entry_type))
        d = str(getattr(entry.direction, "value", entry.direction))
        day = str(entry.date or "")[:10]

        if day in daily_stats:
            if d == WalletDirection.inflow.value:
                daily_stats[day]["inflows"] += amt
            else:
                daily_stats[day]["outflows"] += amt

        movements.append(
            CashFlowMovementRow(
                id=str(getattr(entry, "id", "") or ""),
                date=day,
                wallet=w_key,
                direction=d,
                entry_type=et,
                amount=round(amt, 2),
                remarks=str(getattr(entry, "remarks", "") or ""),
                reference_type=str(getattr(entry, "reference_type", "") or ""),
                reference_id=str(getattr(entry, "reference_id", "") or ""),
                created_by=str(getattr(entry, "created_by", "") or ""),
            )
        )

        if d == WalletDirection.inflow.value:
            wallet_inflows[w_key] += amt
            if et == WalletEntryType.sale.value:
                has_ledger_sales = True
                if w_key in sales_by_wallet:
                    sales_by_wallet[w_key] += amt
            elif et == WalletEntryType.purchase_return.value:
                supplier_refunds += amt
            elif et == WalletEntryType.transfer.value:
                transfers_in += amt
            elif et == WalletEntryType.adjustment.value:
                adjustments_in += amt
            else:
                other_in += amt
        else:
            wallet_outflows[w_key] += amt
            if et == WalletEntryType.expense.value:
                opex_paid += amt
            elif et == WalletEntryType.po_payment.value:
                supplier_po_payments += amt
            elif et == WalletEntryType.transfer.value:
                transfers_out += amt
            elif et == WalletEntryType.adjustment.value:
                adjustments_out += amt
            else:
                other_out += amt

    # If ledger has not yet recorded sales in range, fallback to transaction totals
    if not has_ledger_sales and txns:
        for txn in txns:
            method = normalize_payment_method(
                txn.payment_method.value if hasattr(txn.payment_method, "value") else str(txn.payment_method)
            )
            if method in sales_by_wallet:
                sales_by_wallet[method] += txn.total
                wallet_inflows[method] += txn.total
                day = to_npt(txn.created_at).strftime("%Y-%m-%d")
                if day in daily_stats:
                    daily_stats[day]["inflows"] += float(txn.total or 0.0)

    # Also ensure OpEx and PO payments match expense records if ledger entries were empty
    if opex_paid == 0.0 and pnl.operating_expenses > 0:
        opex_paid = pnl.operating_expenses
        for exp in expenses:
            if is_setup_investment(exp) or is_purchase_order_payment(exp):
                continue
            day = str(getattr(exp, "date", "") or "")[:10]
            if day in daily_stats:
                daily_stats[day]["outflows"] += float(exp.amount or 0.0)
    if supplier_po_payments == 0.0:
        supplier_po_payments = sum(
            e.amount for e in expenses if is_purchase_order_payment(e) and not is_setup_investment(e)
        )
        if supplier_po_payments > 0 and not any(
            str(getattr(e.entry_type, "value", e.entry_type)) == WalletEntryType.po_payment.value
            for e in entries
        ):
            for exp in expenses:
                if not is_purchase_order_payment(exp) or is_setup_investment(exp):
                    continue
                day = str(getattr(exp, "date", "") or "")[:10]
                if day in daily_stats:
                    daily_stats[day]["outflows"] += float(exp.amount or 0.0)
    setup_investment = pnl.setup_investment

    total_sales_collections = sum(sales_by_wallet.values())
    total_inflows = (
        total_sales_collections
        + supplier_refunds
        + transfers_in
        + adjustments_in
        + other_in
    )
    total_outflows = (
        opex_paid
        + supplier_po_payments
        + setup_investment
        + transfers_out
        + adjustments_out
        + other_out
    )
    net_cash_flow = total_inflows - total_outflows

    # Wallet breakdown
    wallet_summaries: list[WalletMovementSummary] = []
    for w in (Wallet.cash, Wallet.bank, Wallet.esewa):
        w_val = w.value
        opening = await ledger_net(w, date_lt=start_str)
        w_in = wallet_inflows.get(w_val, 0.0)
        w_out = wallet_outflows.get(w_val, 0.0)
        w_net = w_in - w_out
        closing = opening + w_net
        wallet_summaries.append(
            WalletMovementSummary(
                wallet=w_val,
                opening_balance=round(opening, 2),
                total_inflows=round(w_in, 2),
                total_outflows=round(w_out, 2),
                net_movement=round(w_net, 2),
                closing_balance=round(closing, 2),
            )
        )

    # Internal inventory product consumption (non-cash OpEx)
    non_cash_consumption = round(
        sum(
            e.amount
            for e in expenses
            if getattr(e, "payment_method", None) == "inventory"
        ),
        2,
    )

    # Cash-to-Profit Bridge:
    # Operating EBIT
    # (+) Non-cash consumption
    # (+) Inventory sold (COGS)
    # (-) Supplier PO payments
    # (+) Supplier refunds collected
    # (+) Net cash float / timing differences
    # = Net Cash Flow
    bridge_subtotal = (
        pnl.operating_profit
        + non_cash_consumption
        + pnl.total_cogs
        - supplier_po_payments
        + supplier_refunds
    )
    timing_float = round(net_cash_flow - bridge_subtotal, 2)

    bridge = CashToProfitBridge(
        accrual_operating_profit=round(pnl.operating_profit, 2),
        non_cash_consumption=non_cash_consumption,
        cogs_inventory_reduction=round(pnl.total_cogs, 2),
        supplier_po_payments=round(supplier_po_payments, 2),
        supplier_refunds_collected=round(supplier_refunds, 2),
        timing_float_difference=timing_float,
        net_cash_flow=round(net_cash_flow, 2),
    )

    daily_trend = [
        CashFlowDailyPoint(
            date=day,
            inflows=round(v["inflows"], 2),
            outflows=round(v["outflows"], 2),
            net=round(v["inflows"] - v["outflows"], 2),
        )
        for day, v in sorted(daily_stats.items())
    ]

    movements.sort(key=lambda m: (m.date, m.entry_type, m.wallet), reverse=True)
    movements_truncated = len(movements) > MOVEMENTS_CAP
    if movements_truncated:
        movements = movements[:MOVEMENTS_CAP]

    statement = CashFlowStatement(
        period_start=start_str,
        period_end=end_str,
        inflows=CashFlowInflows(
            sales_cash=round(sales_by_wallet.get("cash", 0.0), 2),
            sales_bank=round(sales_by_wallet.get("bank", 0.0), 2),
            sales_esewa=round(sales_by_wallet.get("esewa", 0.0), 2),
            total_sales_collections=round(total_sales_collections, 2),
            supplier_refunds=round(supplier_refunds, 2),
            transfers_in=round(transfers_in, 2),
            adjustments_in=round(adjustments_in, 2),
            other_inflows=round(other_in, 2),
            total_inflows=round(total_inflows, 2),
        ),
        outflows=CashFlowOutflows(
            operating_expenses=round(opex_paid, 2),
            supplier_po_payments=round(supplier_po_payments, 2),
            setup_investment=round(setup_investment, 2),
            transfers_out=round(transfers_out, 2),
            adjustments_out=round(adjustments_out, 2),
            other_outflows=round(other_out, 2),
            total_outflows=round(total_outflows, 2),
        ),
        net_cash_flow=round(net_cash_flow, 2),
        wallets=wallet_summaries,
        cash_to_profit_bridge=bridge,
        daily_trend=daily_trend,
        movements=movements,
        movements_truncated=movements_truncated,
    )

    return statement, bridge


async def _build_exec_teasers(
    txns: list[Transaction],
    expenses: list[Expense],
) -> tuple[list[ExpenseByCategory], list[CategoryContribution], list[TenderMixItem]]:
    """OpEx categories + top category margins + tender mix for Executive hub (no extra API round-trips)."""
    opex_stats: dict[str, dict[str, Any]] = defaultdict(lambda: {"amount": 0.0, "count": 0})
    for exp in expenses:
        if is_setup_investment(exp) or is_purchase_order_payment(exp):
            continue
        cat_key = str(getattr(exp.category, "value", exp.category) or "other")
        opex_stats[cat_key]["amount"] += float(exp.amount or 0.0)
        opex_stats[cat_key]["count"] += 1

    opex_by_category = [
        ExpenseByCategory(
            category=cat,
            amount=round(v["amount"], 2),
            count=int(v["count"]),
        )
        for cat, v in sorted(opex_stats.items(), key=lambda x: x[1]["amount"], reverse=True)
    ]

    product_ids = collect_product_ids(txns)
    product_cache = await build_product_cache(product_ids)
    last_cost_cache = await build_last_purchase_cost_cache(product_ids)

    category_stats: dict[str, dict[str, Any]] = defaultdict(
        lambda: {"units": 0, "gross": 0.0, "disc": 0.0, "net": 0.0, "cogs": 0.0}
    )
    tender_stats: dict[str, dict[str, Any]] = defaultdict(lambda: {"amount": 0.0, "count": 0})
    total_net = 0.0

    for txn in txns:
        method = normalize_payment_method(
            txn.payment_method.value if hasattr(txn.payment_method, "value") else str(txn.payment_method)
        )
        tender_stats[method]["amount"] += float(txn.total or 0.0)
        tender_stats[method]["count"] += 1

        txn_line_total = sum(line_revenue(item) for item in txn.items)
        bill_disc = float(getattr(txn, "discount", 0.0) or 0.0)
        revenue_scale = (
            max(0.0, txn_line_total - bill_disc) / txn_line_total if txn_line_total else 1.0
        )

        for item in txn.items:
            product = product_cache.get(item.product_id)
            cat = (product.category if product else (item.category or "Other")) or "Other"
            item_net = line_revenue(item) * revenue_scale
            item_cogs = line_cogs(item, product, last_cost_cache.get(item.product_id))
            category_stats[cat]["units"] += int(item.quantity)
            category_stats[cat]["gross"] += line_gross(item)
            category_stats[cat]["disc"] += line_discount(item)
            category_stats[cat]["net"] += item_net
            category_stats[cat]["cogs"] += item_cogs
            total_net += item_net

    total_gross_profit = sum(v["net"] - v["cogs"] for v in category_stats.values())
    top_categories: list[CategoryContribution] = []
    for cat, v in sorted(category_stats.items(), key=lambda x: x[1]["net"], reverse=True)[:5]:
        c_profit = v["net"] - v["cogs"]
        c_margin = (c_profit / v["net"] * 100) if v["net"] else 0.0
        rev_share = (v["net"] / total_net * 100) if total_net else 0.0
        prof_share = (c_profit / total_gross_profit * 100) if total_gross_profit else 0.0
        top_categories.append(
            CategoryContribution(
                category=cat,
                units_sold=v["units"],
                gross_sales=round(v["gross"], 2),
                discounts=round(v["disc"], 2),
                net_revenue=round(v["net"], 2),
                cogs=round(v["cogs"], 2),
                gross_profit=round(c_profit, 2),
                gross_margin_pct=round(c_margin, 1),
                revenue_share_pct=round(rev_share, 1),
                profit_share_pct=round(prof_share, 1),
            )
        )

    total_tender = sum(v["amount"] for v in tender_stats.values())
    tender_mix = [
        TenderMixItem(
            method=method,
            amount=round(v["amount"], 2),
            transaction_count=v["count"],
            share_pct=round((v["amount"] / total_tender * 100) if total_tender else 0.0, 1),
        )
        for method, v in sorted(tender_stats.items(), key=lambda x: x[1]["amount"], reverse=True)
    ]

    return opex_by_category, top_categories, tender_mix


async def generate_executive_financial_summary(
    start: datetime,
    end: datetime,
) -> ExecutiveFinancialSummary:
    """Generate the complete Executive Financial Summary covering P&L, Cash, Working Capital, and Tax."""
    pnl, txns, expenses = await calculate_trading_pnl(start, end)
    cf_statement, bridge = await calculate_cash_flow_statement(start, end, pnl, txns, expenses)
    tax_vat = await calculate_tax_vat_summary(txns)
    opex_by_category, top_categories, tender_mix = await _build_exec_teasers(txns, expenses)

    start_str = to_npt(start).strftime("%Y-%m-%d")
    end_str = to_npt(end).strftime("%Y-%m-%d")

    working_capital = await calculate_working_capital_indicators(snapshot_mode="live")
    working_capital_closing = await calculate_working_capital_indicators(
        as_of=end_str,
        snapshot_mode="closing",
    )
    try:
        period_till_variance = await sum_cash_till_variances(start_str, end_str)
    except Exception:
        period_till_variance = 0.0

    # Calculate Income vs Expenses summary (include shrinkage in operating cost load)
    total_costs = round(pnl.total_cogs + pnl.operating_expenses + pnl.inventory_shrinkage, 2)
    operating_surplus = round(pnl.net_sales - total_costs, 2)
    cost_to_income = round((total_costs / pnl.net_sales * 100), 1) if pnl.net_sales > 0 else 0.0

    income_vs_expenses = IncomeVsExpensesSummary(
        gross_sales=pnl.gross_sales,
        item_markdowns=pnl.item_markdowns,
        bill_discounts=pnl.bill_discounts,
        total_discounts=pnl.total_discounts,
        net_sales=pnl.net_sales,
        total_cogs=pnl.total_cogs,
        gross_profit=pnl.gross_profit,
        gross_margin_pct=pnl.gross_margin_pct,
        operating_expenses=pnl.operating_expenses,
        total_costs=total_costs,
        operating_surplus=operating_surplus,
        operating_margin_pct=pnl.operating_margin_pct,
        cost_to_income_ratio=cost_to_income,
    )

    # Calculate AP aging & Top Creditors
    all_active_pos = await PurchaseOrder.find({
        "status": {"$in": [POStatus.ordered.value, POStatus.partial.value, POStatus.received.value]}
    }).to_list()
    today_npt = datetime.now(NPT).date()

    ap_aging = APAgingBuckets()
    supplier_creditors: dict[str, dict[str, Any]] = defaultdict(
        lambda: {"name": "", "phone": "", "orders": 0, "invoiced": 0.0, "paid": 0.0, "unpaid": 0.0, "max_age": 0}
    )

    for po in all_active_pos:
        unpaid = max(0.0, float(po.total_amount or 0.0) - float(po.amount_paid or 0.0))
        if unpaid > 0.009:
            if po.received_date and str(po.received_date).strip():
                try:
                    ref_date = date.fromisoformat(str(po.received_date)[:10])
                except Exception:
                    ref_date = to_npt(po.created_at).date()
            else:
                ref_date = to_npt(po.created_at).date()
            age_days = max(0, (today_npt - ref_date).days)
            if age_days <= 30:
                ap_aging.current_0_30 += unpaid
            elif age_days <= 60:
                ap_aging.aging_31_60 += unpaid
            elif age_days <= 90:
                ap_aging.aging_61_90 += unpaid
            else:
                ap_aging.over_90 += unpaid
            ap_aging.total_ap += unpaid

            sid = po.supplier_id or "unknown"
            c = supplier_creditors[sid]
            c["name"] = po.supplier_name or "Unknown Supplier"
            c["orders"] += 1
            c["invoiced"] += float(po.total_amount or 0.0)
            c["paid"] += float(po.amount_paid or 0.0)
            c["unpaid"] += unpaid
            if age_days > c["max_age"]:
                c["max_age"] = age_days

    ap_aging.current_0_30 = round(ap_aging.current_0_30, 2)
    ap_aging.aging_31_60 = round(ap_aging.aging_31_60, 2)
    ap_aging.aging_61_90 = round(ap_aging.aging_61_90, 2)
    ap_aging.over_90 = round(ap_aging.over_90, 2)
    ap_aging.total_ap = round(ap_aging.total_ap, 2)

    top_creditors_list: list[TopCreditorItem] = []
    sorted_creditors = sorted(supplier_creditors.items(), key=lambda x: x[1]["unpaid"], reverse=True)[:5]
    for sid, c in sorted_creditors:
        max_age = c["max_age"]
        aging_stat = "current" if max_age <= 30 else ("due" if max_age <= 60 else ("overdue" if max_age <= 90 else "critical"))
        top_creditors_list.append(
            TopCreditorItem(
                supplier_id=sid,
                supplier_name=c["name"],
                phone=c["phone"],
                total_orders=c["orders"],
                total_invoiced=round(c["invoiced"], 2),
                amount_paid=round(c["paid"], 2),
                outstanding_balance=round(c["unpaid"], 2),
                aging_status=aging_stat,
            )
        )

    receivables_vs_payables = ReceivablesVsPayablesSummary(
        accounts_receivable=working_capital.accounts_receivable,
        accounts_payable=working_capital.accounts_payable,
        net_float=round(working_capital.accounts_receivable - working_capital.accounts_payable, 2),
        cash_coverage_ratio=working_capital.cash_coverage_ratio,
        ap_aging=ap_aging,
    )

    return ExecutiveFinancialSummary(
        period_start=start_str,
        period_end=end_str,
        pnl=pnl,
        cash_flow_summary={
            "total_inflows": cf_statement.inflows.total_inflows,
            "total_outflows": cf_statement.outflows.total_outflows,
            "net_cash_flow": cf_statement.net_cash_flow,
        },
        cash_bridge=bridge,
        working_capital=working_capital,
        working_capital_closing=working_capital_closing,
        period_till_variance=round(period_till_variance, 2),
        tax_vat=tax_vat,
        income_vs_expenses=income_vs_expenses,
        receivables_vs_payables=receivables_vs_payables,
        top_creditors=top_creditors_list,
        opex_by_category=opex_by_category,
        top_categories=top_categories,
        tender_mix=tender_mix,
    )


async def generate_sales_performance_report(
    start: datetime,
    end: datetime,
) -> SalesPerformanceReport:
    """Generate comprehensive Sales & Merchandising report with Category Contribution and Tender Mix."""
    txns = await fetch_transactions(start, end)
    product_ids = collect_product_ids(txns)
    product_cache = await build_product_cache(product_ids)
    last_cost_cache = await build_last_purchase_cost_cache(product_ids)

    start_str = to_npt(start).strftime("%Y-%m-%d")
    end_str = to_npt(end).strftime("%Y-%m-%d")

    total_gross = 0.0
    total_disc = 0.0
    total_net = 0.0
    total_cogs = 0.0
    total_units = 0

    category_stats: dict[str, dict[str, Any]] = defaultdict(
        lambda: {"units": 0, "gross": 0.0, "disc": 0.0, "net": 0.0, "cogs": 0.0}
    )
    tender_stats: dict[str, dict[str, Any]] = defaultdict(
        lambda: {"amount": 0.0, "count": 0}
    )
    daily_stats: dict[str, dict[str, Any]] = defaultdict(
        lambda: {"gross": 0.0, "disc": 0.0, "net": 0.0, "cogs": 0.0, "count": 0}
    )

    # Initialize daily series
    current = to_npt(start).date()
    end_d = to_npt(end).date()
    while current <= end_d:
        daily_stats[current.strftime("%Y-%m-%d")] = {
            "gross": 0.0,
            "disc": 0.0,
            "net": 0.0,
            "cogs": 0.0,
            "count": 0,
        }
        current += timedelta(days=1)

    for txn in txns:
        day = to_npt(txn.created_at).strftime("%Y-%m-%d")
        method = normalize_payment_method(
            txn.payment_method.value if hasattr(txn.payment_method, "value") else str(txn.payment_method)
        )
        tender_stats[method]["amount"] += txn.total
        tender_stats[method]["count"] += 1

        txn_line_total = sum(line_revenue(item) for item in txn.items)
        bill_disc = float(getattr(txn, "discount", 0.0) or 0.0)
        revenue_scale = (
            max(0.0, txn_line_total - bill_disc) / txn_line_total
            if txn_line_total
            else 1.0
        )

        txn_gross = sum(line_gross(item) for item in txn.items)
        txn_item_disc = sum(line_discount(item) for item in txn.items)
        txn_total_disc = txn_item_disc + bill_disc
        txn_net = max(0.0, txn_gross - txn_total_disc)

        txn_cogs = float(getattr(txn, "total_cost", 0.0) or 0.0)
        if txn_cogs <= 0:
            txn_cogs = sum(
                line_cogs(
                    item,
                    product_cache.get(item.product_id),
                    last_cost_cache.get(item.product_id),
                )
                for item in txn.items
            )

        total_gross += txn_gross
        total_disc += txn_total_disc
        total_net += txn_net
        total_cogs += txn_cogs

        if day in daily_stats:
            daily_stats[day]["gross"] += txn_gross
            daily_stats[day]["disc"] += txn_total_disc
            daily_stats[day]["net"] += txn_net
            daily_stats[day]["cogs"] += txn_cogs
            daily_stats[day]["count"] += 1

        for item in txn.items:
            product = product_cache.get(item.product_id)
            cat = product.category if product else (item.category or "Other")
            if not cat:
                cat = "Other"

            item_qty = int(item.quantity)
            item_gross = line_gross(item)
            item_disc = line_discount(item)
            item_net = line_revenue(item) * revenue_scale
            item_cogs = line_cogs(item, product, last_cost_cache.get(item.product_id))

            total_units += item_qty
            category_stats[cat]["units"] += item_qty
            category_stats[cat]["gross"] += item_gross
            category_stats[cat]["disc"] += item_disc
            category_stats[cat]["net"] += item_net
            category_stats[cat]["cogs"] += item_cogs

    total_gross_profit = total_net - total_cogs
    gross_margin_pct = (total_gross_profit / total_net * 100) if total_net else 0.0
    avg_basket = (total_net / len(txns)) if txns else 0.0

    # Format Category Contribution
    categories: list[CategoryContribution] = []
    for cat, v in sorted(category_stats.items(), key=lambda x: x[1]["net"], reverse=True):
        c_profit = v["net"] - v["cogs"]
        c_margin = (c_profit / v["net"] * 100) if v["net"] else 0.0
        rev_share = (v["net"] / total_net * 100) if total_net else 0.0
        prof_share = (c_profit / total_gross_profit * 100) if total_gross_profit else 0.0
        categories.append(
            CategoryContribution(
                category=cat,
                units_sold=v["units"],
                gross_sales=round(v["gross"], 2),
                discounts=round(v["disc"], 2),
                net_revenue=round(v["net"], 2),
                cogs=round(v["cogs"], 2),
                gross_profit=round(c_profit, 2),
                gross_margin_pct=round(c_margin, 1),
                revenue_share_pct=round(rev_share, 1),
                profit_share_pct=round(prof_share, 1),
            )
        )

    # Format Tender Mix
    total_tender = sum(v["amount"] for v in tender_stats.values())
    tender_mix: list[TenderMixItem] = [
        TenderMixItem(
            method=method,
            amount=round(v["amount"], 2),
            transaction_count=v["count"],
            share_pct=round((v["amount"] / total_tender * 100) if total_tender else 0.0, 1),
        )
        for method, v in sorted(tender_stats.items(), key=lambda x: x[1]["amount"], reverse=True)
    ]

    # Format Daily Trend
    daily_trend: list[DailySalesPerformance] = [
        DailySalesPerformance(
            date=day,
            gross_sales=round(v["gross"], 2),
            discounts=round(v["disc"], 2),
            net_revenue=round(v["net"], 2),
            cogs=round(v["cogs"], 2),
            gross_profit=round(v["net"] - v["cogs"], 2),
            gross_margin_pct=round(((v["net"] - v["cogs"]) / v["net"] * 100) if v["net"] else 0.0, 1),
            transaction_count=v["count"],
        )
        for day, v in sorted(daily_stats.items())
    ]

    return SalesPerformanceReport(
        period_start=start_str,
        period_end=end_str,
        total_gross_sales=round(total_gross, 2),
        total_discounts=round(total_disc, 2),
        total_net_revenue=round(total_net, 2),
        total_cogs=round(total_cogs, 2),
        total_gross_profit=round(total_gross_profit, 2),
        gross_margin_pct=round(gross_margin_pct, 1),
        transaction_count=len(txns),
        total_units_sold=total_units,
        avg_basket=round(avg_basket, 2),
        categories=categories,
        tender_mix=tender_mix,
        daily_trend=daily_trend,
    )
