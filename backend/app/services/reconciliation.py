from __future__ import annotations

import calendar
from datetime import datetime, timezone

from fastapi import HTTPException, status

from app.models.bank_reconciliation import BankReconciliation, ReconciliationStatus
from app.models.expense import Expense
from app.models.transaction import Transaction, TransactionStatus
from app.models.wallet_ledger import WalletLedgerEntry, WalletDirection, WalletEntryType


def _normalize_method(m: str) -> str:
    return "bank" if m in ("bank", "card") else m


async def _get_day_bank_figures(date: str) -> dict:
    """Return all bank wallet figures for the given date."""
    start_dt = datetime.fromisoformat(f"{date}T00:00:00+00:00")
    end_dt = datetime.fromisoformat(f"{date}T23:59:59.999999+00:00")

    sales_pipeline = [
        {
            "$match": {
                "created_at": {"$gte": start_dt, "$lte": end_dt},
                "status": {"$ne": TransactionStatus.voided.value},
                "payment_method": {"$in": ["bank", "card"]},
            }
        },
        {"$group": {"_id": None, "total": {"$sum": "$total"}}},
    ]
    sales_rows = await Transaction.aggregate(sales_pipeline).to_list()
    bank_sales = round(float(sales_rows[0]["total"]) if sales_rows else 0.0, 2)

    expense_pipeline = [
        {
            "$match": {
                "date": date,
                "payment_method": {"$in": ["bank", "card"]},
            }
        },
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}},
    ]
    expense_rows = await Expense.aggregate(expense_pipeline).to_list()
    bank_expenses = round(float(expense_rows[0]["total"]) if expense_rows else 0.0, 2)

    # Transfers, adjustments, custody from wallet ledger (bank wallet only)
    ledger_pipeline = [
        {
            "$match": {
                "wallet": "bank",
                "date": date,
                "entry_type": {"$in": [
                    WalletEntryType.transfer.value,
                    WalletEntryType.adjustment.value,
                    WalletEntryType.custody.value,
                ]},
            }
        },
        {
            "$group": {
                "_id": {"entry_type": "$entry_type", "direction": "$direction"},
                "total": {"$sum": "$amount"},
            }
        },
    ]
    col = WalletLedgerEntry.get_motor_collection()
    ledger_rows = await col.aggregate(ledger_pipeline).to_list(None)

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
        "bank_sales": bank_sales,
        "bank_expenses": bank_expenses,
        **{k: round(v, 2) for k, v in figures.items()},
    }


async def get_previous_record(date: str) -> BankReconciliation | None:
    """Return the most recent reconciliation strictly before the given date."""
    return await BankReconciliation.find(
        BankReconciliation.date < date
    ).sort(-BankReconciliation.date).first_or_none()


async def get_day_data(date: str) -> dict:
    f = await _get_day_bank_figures(date)
    previous = await get_previous_record(date)
    return {
        "date": date,
        "today_bank_sales_in": f["bank_sales"],
        "today_bank_expenses": f["bank_expenses"],
        "today_transfers_in": f["transfers_in"],
        "today_transfers_out": f["transfers_out"],
        "today_adjustments_in": f["adjustments_in"],
        "today_adjustments_out": f["adjustments_out"],
        "today_custody_in": f["custody_in"],
        "today_custody_out": f["custody_out"],
        "previous_record": _to_response(previous) if previous else None,
    }


async def list_reconciliations(
    page: int = 1,
    page_size: int = 25,
    start_date: str | None = None,
    end_date: str | None = None,
) -> dict:
    query = BankReconciliation.find()
    if start_date:
        query = query.find(BankReconciliation.date >= start_date)
    if end_date:
        query = query.find(BankReconciliation.date <= end_date)

    total = await query.count()
    records = await query.sort(-BankReconciliation.date).skip((page - 1) * page_size).limit(page_size).to_list()
    return {
        "data": [_to_response(r) for r in records],
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": max(1, -(-total // page_size)),
    }


async def get_by_date(date: str) -> BankReconciliation | None:
    return await BankReconciliation.find_one(BankReconciliation.date == date)


async def upsert_reconciliation(
    date: str,
    is_initial: bool,
    previous_bank_balance: float | None,
    previous_fone_pay_balance: float | None,
    today_other_bank_in: float,
    today_bank_balance: float,
    today_fone_pay_balance: float,
    notes: str | None,
    created_by: str,
) -> BankReconciliation:
    f = await _get_day_bank_figures(date)
    bank_sales = f["bank_sales"]
    bank_expenses = f["bank_expenses"]
    transfers_in = f["transfers_in"]
    transfers_out = f["transfers_out"]
    adjustments_in = f["adjustments_in"]
    adjustments_out = f["adjustments_out"]
    custody_in = f["custody_in"]
    custody_out = f["custody_out"]

    if is_initial:
        prev_bank = round(previous_bank_balance or 0.0, 2)
        prev_fonepay = round(previous_fone_pay_balance or 0.0, 2)
    else:
        prev = await get_previous_record(date)
        prev_bank = round(float(prev.today_bank_balance) if prev else 0.0, 2)
        prev_fonepay = round(float(prev.today_fone_pay_balance) if prev else 0.0, 2)

    expected = round(
        prev_bank + prev_fonepay
        + bank_sales + today_other_bank_in
        + transfers_in + adjustments_in + custody_in
        - bank_expenses - transfers_out - adjustments_out - custody_out,
        2,
    )
    actual = round(today_bank_balance + today_fone_pay_balance, 2)
    difference = round(actual - expected, 2)
    recon_status = ReconciliationStatus.reconciled if abs(difference) < 0.01 else ReconciliationStatus.difference
    now = datetime.now(timezone.utc)

    existing = await get_by_date(date)
    if existing:
        await existing.set({
            "is_initial": is_initial,
            "previous_bank_balance": prev_bank,
            "previous_fone_pay_balance": prev_fonepay,
            "today_bank_sales_in": bank_sales,
            "today_other_bank_in": round(today_other_bank_in, 2),
            "today_bank_expenses": bank_expenses,
            "today_transfers_in": transfers_in,
            "today_transfers_out": transfers_out,
            "today_adjustments_in": adjustments_in,
            "today_adjustments_out": adjustments_out,
            "today_custody_in": custody_in,
            "today_custody_out": custody_out,
            "expected_balance": expected,
            "today_bank_balance": round(today_bank_balance, 2),
            "today_fone_pay_balance": round(today_fone_pay_balance, 2),
            "actual_balance": actual,
            "difference": difference,
            "status": recon_status,
            "notes": notes,
            "updated_by": created_by,
            "updated_at": now,
        })
        return await BankReconciliation.find_one(BankReconciliation.date == date)  # type: ignore[return-value]

    doc = BankReconciliation(
        date=date,
        is_initial=is_initial,
        previous_bank_balance=prev_bank,
        previous_fone_pay_balance=prev_fonepay,
        today_bank_sales_in=bank_sales,
        today_other_bank_in=round(today_other_bank_in, 2),
        today_bank_expenses=bank_expenses,
        today_transfers_in=transfers_in,
        today_transfers_out=transfers_out,
        today_adjustments_in=adjustments_in,
        today_adjustments_out=adjustments_out,
        today_custody_in=custody_in,
        today_custody_out=custody_out,
        expected_balance=expected,
        today_bank_balance=round(today_bank_balance, 2),
        today_fone_pay_balance=round(today_fone_pay_balance, 2),
        actual_balance=actual,
        difference=difference,
        status=recon_status,
        notes=notes,
        created_by=created_by,
        updated_by=created_by,
        created_at=now,
        updated_at=now,
    )
    await doc.insert()
    return doc


def _to_response(r: BankReconciliation) -> dict:
    return {
        "id": str(r.id),
        "date": r.date,
        "is_initial": r.is_initial,
        "previous_bank_balance": round(float(r.previous_bank_balance), 2),
        "previous_fone_pay_balance": round(float(r.previous_fone_pay_balance), 2),
        "today_bank_sales_in": round(float(r.today_bank_sales_in), 2),
        "today_other_bank_in": round(float(r.today_other_bank_in), 2),
        "today_bank_expenses": round(float(r.today_bank_expenses), 2),
        "today_transfers_in": round(float(getattr(r, 'today_transfers_in', 0) or 0), 2),
        "today_transfers_out": round(float(getattr(r, 'today_transfers_out', 0) or 0), 2),
        "today_adjustments_in": round(float(getattr(r, 'today_adjustments_in', 0) or 0), 2),
        "today_adjustments_out": round(float(getattr(r, 'today_adjustments_out', 0) or 0), 2),
        "today_custody_in": round(float(getattr(r, 'today_custody_in', 0) or 0), 2),
        "today_custody_out": round(float(getattr(r, 'today_custody_out', 0) or 0), 2),
        "expected_balance": round(float(r.expected_balance), 2),
        "today_bank_balance": round(float(r.today_bank_balance), 2),
        "today_fone_pay_balance": round(float(r.today_fone_pay_balance), 2),
        "actual_balance": round(float(r.actual_balance), 2),
        "difference": round(float(r.difference), 2),
        "status": r.status.value if hasattr(r.status, "value") else str(r.status),
        "notes": r.notes or None,
        "created_by": r.created_by or "",
        "updated_by": r.updated_by or "",
        "created_at": r.created_at.isoformat(),
        "updated_at": r.updated_at.isoformat(),
    }


async def get_daily_reconciliation(month: str) -> list[dict]:
    """Return per-day cash/bank sales and expenses for the given YYYY-MM month.
    Kept for backward compatibility with the existing /reconciliation/daily endpoint.
    """
    try:
        year, mon = int(month[:4]), int(month[5:7])
    except (ValueError, IndexError):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="month must be in YYYY-MM format",
        )

    last_day = calendar.monthrange(year, mon)[1]
    month_start = f"{year:04d}-{mon:02d}-01"
    month_end = f"{year:04d}-{mon:02d}-{last_day:02d}"

    start_dt = datetime(year, mon, 1, tzinfo=timezone.utc)
    end_dt = datetime(year, mon, last_day, 23, 59, 59, 999999, tzinfo=timezone.utc)

    sales_pipeline = [
        {
            "$match": {
                "created_at": {"$gte": start_dt, "$lte": end_dt},
                "status": {"$ne": TransactionStatus.voided.value},
                "payment_method": {"$in": ["cash", "bank"]},
            }
        },
        {
            "$group": {
                "_id": {
                    "date": {"$dateToString": {"format": "%Y-%m-%d", "date": "$created_at"}},
                    "method": "$payment_method",
                },
                "total": {"$sum": "$total"},
            }
        },
    ]
    sales_rows = await Transaction.aggregate(sales_pipeline).to_list()

    expense_pipeline = [
        {
            "$match": {
                "date": {"$gte": month_start, "$lte": month_end},
                "payment_method": {"$in": ["cash", "bank"]},
            }
        },
        {
            "$group": {
                "_id": {"date": "$date", "method": "$payment_method"},
                "total": {"$sum": "$amount"},
            }
        },
    ]
    expense_rows = await Expense.aggregate(expense_pipeline).to_list()

    daily: dict[str, dict] = {}

    def _day(d: str) -> dict:
        return daily.setdefault(d, {
            "date": d,
            "cash_sales": 0.0,
            "cash_expenses": 0.0,
            "bank_sales": 0.0,
            "bank_expenses": 0.0,
        })

    for row in sales_rows:
        d, method = row["_id"]["date"], row["_id"]["method"]
        key = "cash_sales" if method == "cash" else "bank_sales"
        _day(d)[key] = round(float(row["total"]), 2)

    for row in expense_rows:
        d, method = row["_id"]["date"], row["_id"]["method"]
        key = "cash_expenses" if method == "cash" else "bank_expenses"
        _day(d)[key] = round(float(row["total"]), 2)

    return sorted(daily.values(), key=lambda x: x["date"])
