from __future__ import annotations

from datetime import datetime, timezone

from app.models.cash_reconciliation import CashReconciliation, CashReconciliationStatus, CashDenomination
from app.models.expense import Expense
from app.models.transaction import Transaction, TransactionStatus
from app.models.wallet_ledger import WalletLedgerEntry, WalletDirection, WalletEntryType


async def _get_day_cash_figures(date: str) -> dict:
    start_dt = datetime.fromisoformat(f"{date}T00:00:00+00:00")
    end_dt = datetime.fromisoformat(f"{date}T23:59:59.999999+00:00")

    sales_rows = await Transaction.aggregate([
        {"$match": {
            "created_at": {"$gte": start_dt, "$lte": end_dt},
            "status": {"$ne": TransactionStatus.voided.value},
            "payment_method": "cash",
        }},
        {"$group": {"_id": None, "total": {"$sum": "$total"}}},
    ]).to_list()
    cash_sales = round(float(sales_rows[0]["total"]) if sales_rows else 0.0, 2)

    expense_rows = await Expense.aggregate([
        {"$match": {"date": date, "payment_method": "cash"}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}},
    ]).to_list()
    cash_expenses = round(float(expense_rows[0]["total"]) if expense_rows else 0.0, 2)

    col = WalletLedgerEntry.get_motor_collection()
    ledger_rows = await col.aggregate([
        {"$match": {
            "wallet": "cash",
            "date": date,
            "entry_type": {"$in": [
                WalletEntryType.transfer.value,
                WalletEntryType.adjustment.value,
                WalletEntryType.custody.value,
            ]},
        }},
        {"$group": {
            "_id": {"entry_type": "$entry_type", "direction": "$direction"},
            "total": {"$sum": "$amount"},
        }},
    ]).to_list(None)

    figures = {
        "transfers_in": 0.0, "transfers_out": 0.0,
        "adjustments_in": 0.0, "adjustments_out": 0.0,
        "custody_in": 0.0, "custody_out": 0.0,
    }
    for row in ledger_rows:
        key = row.get("_id") or {}
        et = key.get("entry_type", "")
        direction = key.get("direction", "")
        amt = round(float(row.get("total") or 0), 2)
        if et == WalletEntryType.transfer.value:
            figures["transfers_in" if direction == WalletDirection.inflow.value else "transfers_out"] += amt
        elif et == WalletEntryType.adjustment.value:
            figures["adjustments_in" if direction == WalletDirection.inflow.value else "adjustments_out"] += amt
        elif et == WalletEntryType.custody.value:
            figures["custody_in" if direction == WalletDirection.inflow.value else "custody_out"] += amt

    return {
        "cash_sales": cash_sales,
        "cash_expenses": cash_expenses,
        **{k: round(v, 2) for k, v in figures.items()},
    }


async def get_previous_cash_record(date: str) -> CashReconciliation | None:
    return await CashReconciliation.find(
        CashReconciliation.date < date
    ).sort(-CashReconciliation.date).first_or_none()


async def get_cash_day_data(date: str) -> dict:
    f = await _get_day_cash_figures(date)
    previous = await get_previous_cash_record(date)
    return {
        "date": date,
        "today_cash_sales_in": f["cash_sales"],
        "today_cash_expenses": f["cash_expenses"],
        "today_transfers_in": f["transfers_in"],
        "today_transfers_out": f["transfers_out"],
        "today_adjustments_in": f["adjustments_in"],
        "today_adjustments_out": f["adjustments_out"],
        "today_custody_in": f["custody_in"],
        "today_custody_out": f["custody_out"],
        "previous_record": _to_response(previous) if previous else None,
    }


async def list_cash_reconciliations(
    page: int = 1,
    page_size: int = 25,
    start_date: str | None = None,
    end_date: str | None = None,
) -> dict:
    query = CashReconciliation.find()
    if start_date:
        query = query.find(CashReconciliation.date >= start_date)
    if end_date:
        query = query.find(CashReconciliation.date <= end_date)

    total = await query.count()
    records = await query.sort(-CashReconciliation.date).skip((page - 1) * page_size).limit(page_size).to_list()
    return {
        "data": [_to_response(r) for r in records],
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": max(1, -(-total // page_size)),
    }


async def get_cash_by_date(date: str) -> CashReconciliation | None:
    return await CashReconciliation.find_one(CashReconciliation.date == date)


async def upsert_cash_reconciliation(
    date: str,
    is_initial: bool,
    opening_cash: float | None,
    today_other_cash_in: float,
    actual_closing_cash: float,
    notes: str | None,
    cash_count_mode: str | None,
    denominations: list | None,
    created_by: str,
) -> CashReconciliation:
    f = await _get_day_cash_figures(date)

    if is_initial:
        open_cash = round(opening_cash or 0.0, 2)
    else:
        prev = await get_previous_cash_record(date)
        open_cash = round(float(prev.actual_closing_cash) if prev else 0.0, 2)

    other_in = round(today_other_cash_in, 2)
    expected = round(
        open_cash
        + f["cash_sales"] + other_in
        + f["transfers_in"] + f["adjustments_in"] + f["custody_in"]
        - f["cash_expenses"] - f["transfers_out"] - f["adjustments_out"] - f["custody_out"],
        2,
    )
    actual = round(actual_closing_cash, 2)
    difference = round(actual - expected, 2)
    recon_status = (
        CashReconciliationStatus.reconciled if abs(difference) < 0.01
        else CashReconciliationStatus.difference
    )
    now = datetime.now(timezone.utc)

    fields = {
        "is_initial": is_initial,
        "opening_cash": open_cash,
        "today_cash_sales_in": f["cash_sales"],
        "today_other_cash_in": other_in,
        "today_cash_expenses": f["cash_expenses"],
        "today_transfers_in": f["transfers_in"],
        "today_transfers_out": f["transfers_out"],
        "today_adjustments_in": f["adjustments_in"],
        "today_adjustments_out": f["adjustments_out"],
        "today_custody_in": f["custody_in"],
        "today_custody_out": f["custody_out"],
        "expected_closing_cash": expected,
        "actual_closing_cash": actual,
        "difference": difference,
        "status": recon_status,
        "notes": notes,
        "cash_count_mode": cash_count_mode,
        "denominations": [
            CashDenomination(**d) if isinstance(d, dict) else d
            for d in denominations
        ] if denominations else None,
        "updated_by": created_by,
        "updated_at": now,
    }

    existing = await get_cash_by_date(date)
    if existing:
        await existing.set(fields)
        return await CashReconciliation.find_one(CashReconciliation.date == date)  # type: ignore[return-value]

    doc = CashReconciliation(
        date=date,
        created_by=created_by,
        created_at=now,
        **fields,
    )
    await doc.insert()
    return doc


def _to_response(r: CashReconciliation) -> dict:
    return {
        "id": str(r.id),
        "date": r.date,
        "is_initial": r.is_initial,
        "opening_cash": round(float(r.opening_cash), 2),
        "today_cash_sales_in": round(float(r.today_cash_sales_in), 2),
        "today_other_cash_in": round(float(getattr(r, "today_other_cash_in", 0) or 0), 2),
        "today_cash_expenses": round(float(r.today_cash_expenses), 2),
        "today_transfers_in": round(float(getattr(r, "today_transfers_in", 0) or 0), 2),
        "today_transfers_out": round(float(getattr(r, "today_transfers_out", 0) or 0), 2),
        "today_adjustments_in": round(float(getattr(r, "today_adjustments_in", 0) or 0), 2),
        "today_adjustments_out": round(float(getattr(r, "today_adjustments_out", 0) or 0), 2),
        "today_custody_in": round(float(getattr(r, "today_custody_in", 0) or 0), 2),
        "today_custody_out": round(float(getattr(r, "today_custody_out", 0) or 0), 2),
        "expected_closing_cash": round(float(r.expected_closing_cash), 2),
        "actual_closing_cash": round(float(r.actual_closing_cash), 2),
        "difference": round(float(r.difference), 2),
        "status": r.status.value if hasattr(r.status, "value") else str(r.status),
        "notes": r.notes or None,
        "cash_count_mode": r.cash_count_mode or None,
        "denominations": [
            {"denomination": d.denomination, "quantity": d.quantity, "amount": d.amount}
            for d in r.denominations
        ] if r.denominations else None,
        "created_by": r.created_by or "",
        "updated_by": r.updated_by or "",
        "created_at": r.created_at.isoformat() if r.created_at else None,
        "updated_at": r.updated_at.isoformat() if r.updated_at else None,
    }
