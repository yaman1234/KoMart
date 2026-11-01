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
from app.models.transaction import PaymentMethod, Transaction, TransactionStatus
from app.models.wallet_ledger import (
    Wallet,
    WalletDirection,
    WalletEntryType,
    WalletLedgerEntry,
)
from app.schemas.reports import (
    APAgingBuckets,
    CashFlowInflows,
    CashFlowOutflows,
    CashFlowStatement,
    CashToProfitBridge,
    CategoryContribution,
    DailySalesPerformance,
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
    current_wallet_balance,
    ensure_backfill,
    ledger_net,
    open_custody_total,
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

    gross_sales = 0.0
    item_markdowns = 0.0
    bill_discounts = 0.0
    total_cogs = 0.0

    for txn in txns:
        txn_gross = sum(line_gross(item) for item in txn.items)
        txn_item_disc = sum(line_discount(item) for item in txn.items)
        txn_bill_disc = float(getattr(txn, "discount", 0.0) or 0.0)

        txn_cogs = float(getattr(txn, "total_cost", 0.0) or 0.0)
        if txn_cogs <= 0:
            txn_cogs = sum(
                line_cogs(item, product_cache.get(item.product_id)) for item in txn.items
            )

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

    # Operating expenses exclude setup investment (CapEx) and PO payments (inventory)
    operating_expenses = max(0.0, total_expenses - setup_investment - po_paid)
    operating_profit = gross_profit - operating_expenses
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
        operating_profit=round(operating_profit, 2),
        operating_margin_pct=round(operating_margin_pct, 1),
        setup_investment=round(setup_investment, 2),
        net_profit=round(net_profit, 2),
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


async def calculate_working_capital_indicators() -> WorkingCapitalSummary:
    """Compute active inventory value, live bank/till/custody, accounts payable, and pending returns receivables."""
    # 1. Total batch-weighted inventory valuation
    inventory_value = await aggregate_batch_inventory_value()

    # 2. Outstanding Accounts Payable (Active POs: ordered, partial, received)
    active_pos = await PurchaseOrder.find(
        {"status": {"$in": [POStatus.ordered.value, POStatus.partial.value, POStatus.received.value]}}
    ).to_list()
    accounts_payable = sum(max(0.0, po.total_amount - po.amount_paid) for po in active_pos)

    # 3. Pending Supplier Receivables (Requested Returns)
    open_returns = await PurchaseReturn.find(
        {"status": PurchaseReturnStatus.requested.value}
    ).to_list()
    accounts_receivable = sum(
        max(0.0, r.total_amount - (r.amount_received + r.write_off_amount))
        for r in open_returns
    )

    # 4. Cash & Bank balances from wallet ledger & custody
    try:
        balances = await all_balances()
        bank_bal = round(float(balances.get("bank", 0.0) or 0.0), 2)
        esewa_bal = round(float(balances.get("esewa", 0.0) or 0.0), 2)
        bank_and_digital = round(bank_bal + esewa_bal, 2)
        cash_ledger = await current_wallet_balance(Wallet.cash)
        till_bal = round(float(cash_ledger or 0.0), 2)
        with_staff = await open_custody_total()
        staff_bal = round(float(with_staff or 0.0), 2)
    except Exception:
        bank_bal = 0.0
        esewa_bal = 0.0
        bank_and_digital = 0.0
        till_bal = 0.0
        staff_bal = 0.0

    total_liquid = round(bank_and_digital + till_bal + staff_bal, 2)
    total_wc = round(total_liquid + inventory_value, 2)
    net_wc = round((total_wc + accounts_receivable) - accounts_payable, 2)
    cov_ratio = round(total_liquid / accounts_payable, 2) if accounts_payable > 0 else (99.0 if total_liquid > 0 else 0.0)

    return WorkingCapitalSummary(
        inventory_value=round(inventory_value, 2),
        accounts_payable=round(accounts_payable, 2),
        accounts_receivable=round(accounts_receivable, 2),
        bank_balance=bank_bal,
        esewa_balance=esewa_bal,
        bank_and_digital_total=bank_and_digital,
        cash_till_balance=till_bal,
        cash_with_staff=staff_bal,
        total_liquid_cash=total_liquid,
        total_working_capital=total_wc,
        net_working_capital=net_wc,
        cash_coverage_ratio=cov_ratio,
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

    has_ledger_sales = False
    for entry in entries:
        w_key = str(getattr(entry.wallet, "value", entry.wallet))
        amt = float(entry.amount or 0.0)
        et = str(getattr(entry.entry_type, "value", entry.entry_type))
        d = str(getattr(entry.direction, "value", entry.direction))

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

    # Also ensure OpEx and PO payments match expense records if ledger entries were empty
    if opex_paid == 0.0 and pnl.operating_expenses > 0:
        opex_paid = pnl.operating_expenses
    if supplier_po_payments == 0.0:
        supplier_po_payments = sum(
            e.amount for e in expenses if is_purchase_order_payment(e) and not is_setup_investment(e)
        )

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
    )

    return statement, bridge


async def generate_executive_financial_summary(
    start: datetime,
    end: datetime,
) -> ExecutiveFinancialSummary:
    """Generate the complete Executive Financial Summary covering P&L, Cash, Working Capital, and Tax."""
    pnl, txns, expenses = await calculate_trading_pnl(start, end)
    cf_statement, bridge = await calculate_cash_flow_statement(start, end, pnl, txns, expenses)
    working_capital = await calculate_working_capital_indicators()
    tax_vat = await calculate_tax_vat_summary(txns)

    start_str = to_npt(start).strftime("%Y-%m-%d")
    end_str = to_npt(end).strftime("%Y-%m-%d")

    # Calculate Income vs Expenses summary
    total_costs = round(pnl.total_cogs + pnl.operating_expenses, 2)
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
        tax_vat=tax_vat,
        income_vs_expenses=income_vs_expenses,
        receivables_vs_payables=receivables_vs_payables,
        top_creditors=top_creditors_list,
    )


async def generate_sales_performance_report(
    start: datetime,
    end: datetime,
) -> SalesPerformanceReport:
    """Generate comprehensive Sales & Merchandising report with Category Contribution and Tender Mix."""
    txns = await fetch_transactions(start, end)
    product_ids = collect_product_ids(txns)
    product_cache = await build_product_cache(product_ids)

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
                line_cogs(item, product_cache.get(item.product_id)) for item in txn.items
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
            item_cogs = line_cogs(item, product)

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
