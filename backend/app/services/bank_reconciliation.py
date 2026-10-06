from __future__ import annotations

from datetime import datetime, timezone

from fastapi import HTTPException, status

from app.models.bank_reconciliation import BankReconciliation, ReconciliationStatus
from app.models.expense import Expense
from app.models.transaction import Transaction, TransactionStatus


def _normalize_method(m: str) -> str:
    return "bank" if m in ("bank", "card") else m


async def _get_bank_sales_in(date: str) -> float:
    """Sum of bank-method sales for the given date."""
    start = datetime.fromisoformat(f"{date}T00:00:00+00:00")
    end = datetime.fromisoformat(f"{date}T23:59:59.999999+00:00")
    pipeline = [
        {
            "$match": {
                "created_at": {"$gte": start, "$lte": end},
                "status": {"$ne": TransactionStatus.voided.value},
                "payment_method": {"$in": ["bank", "card"]},
            }
        },
        {"$group": {"_id": None, "total": {"$sum": "$total"}}},
    ]
    rows = await Transaction.aggregate(pipeline).to_list()
    return round(float(rows[0]["total"]) if rows else 0.0, 2)


async def _get_bank_expenses(date: str) -> float:
    """Sum of bank-method expenses for the given date."""
    pipeline = [
        {
            "$match": {
                "date": date,
                "payment_method": {"$in": ["bank", "card"]},
            }
        },
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}},
    ]
    rows = await Expense.aggregate(pipeline).to_list()
    return round(float(rows[0]["total"]) if rows else 0.0, 2)


async def get_previous_record(before_date: str) -> BankReconciliation | None:
    """Most recent reconciliation strictly before the given date."""
    return await BankReconciliation.find(
        BankReconciliation.date < before_date
    ).sort(-BankReconciliation.date).first_or_none()


async def get_day_data(date: str) -> dict:
    bank_sales_in = await _get_bank_sales_in(date)
    bank_expenses = await _get_bank_expenses(date)
    previous = await get_previous_record(date)
    return {
        "date": date,
        "today_bank_sales_in": bank_sales_in,
        "today_bank_expenses": bank_expenses,
        "previous_record": _to_response(previous) if previous else None,
    }


def _compute(
    prev_bank: float,
    prev_fone_pay: float,
    bank_sales_in: float,
    other_bank_in: float,
    bank_expenses: float,
    today_bank: float,
    today_fone_pay: float,
) -> tuple[float, float, float, ReconciliationStatus]:
    expected = round(prev_bank + prev_fone_pay + bank_sales_in + other_bank_in - bank_expenses, 2)
    actual = round(today_bank + today_fone_pay, 2)
    difference = round(actual - expected, 2)
    recon_status = ReconciliationStatus.reconciled if abs(difference) < 0.01 else ReconciliationStatus.difference
    return expected, actual, difference, recon_status


def _to_response(doc: BankReconciliation) -> dict:
    return {
        "id": str(doc.id),
        "date": doc.date,
        "is_initial": doc.is_initial,
        "previous_bank_balance": doc.previous_bank_balance,
        "previous_fone_pay_balance": doc.previous_fone_pay_balance,
        "today_bank_sales_in": doc.today_bank_sales_in,
        "today_other_bank_in": doc.today_other_bank_in,
        "today_bank_expenses": doc.today_bank_expenses,
        "expected_balance": doc.expected_balance,
        "today_bank_balance": doc.today_bank_balance,
        "today_fone_pay_balance": doc.today_fone_pay_balance,
        "actual_balance": doc.actual_balance,
        "difference": doc.difference,
        "status": doc.status.value,
        "created_by": doc.created_by,
        "updated_by": doc.updated_by,
        "created_at": doc.created_at.isoformat(),
        "updated_at": doc.updated_at.isoformat(),
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
    docs = await query.sort(-BankReconciliation.date).skip((page - 1) * page_size).limit(page_size).to_list()
    return {
        "data": [_to_response(d) for d in docs],
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
    created_by: str,
) -> BankReconciliation:
    bank_sales_in = await _get_bank_sales_in(date)
    bank_expenses = await _get_bank_expenses(date)

    if is_initial:
        prev_bank = previous_bank_balance or 0.0
        prev_fone_pay = previous_fone_pay_balance or 0.0
    else:
        prev = await get_previous_record(date)
        prev_bank = prev.today_bank_balance if prev else 0.0
        prev_fone_pay = prev.today_fone_pay_balance if prev else 0.0

    expected, actual, difference, recon_status = _compute(
        prev_bank, prev_fone_pay, bank_sales_in,
        today_other_bank_in, bank_expenses,
        today_bank_balance, today_fone_pay_balance,
    )

    now = datetime.now(timezone.utc)
    existing = await get_by_date(date)

    if existing:
        await existing.set({
            "is_initial": is_initial,
            "previous_bank_balance": round(prev_bank, 2),
            "previous_fone_pay_balance": round(prev_fone_pay, 2),
            "today_bank_sales_in": bank_sales_in,
            "today_other_bank_in": round(today_other_bank_in, 2),
            "today_bank_expenses": bank_expenses,
            "expected_balance": expected,
            "today_bank_balance": round(today_bank_balance, 2),
            "today_fone_pay_balance": round(today_fone_pay_balance, 2),
            "actual_balance": actual,
            "difference": difference,
            "status": recon_status,
            "updated_by": created_by,
            "updated_at": now,
        })
        return await BankReconciliation.find_one(BankReconciliation.date == date)  # type: ignore[return-value]

    doc = BankReconciliation(
        date=date,
        is_initial=is_initial,
        previous_bank_balance=round(prev_bank, 2),
        previous_fone_pay_balance=round(prev_fone_pay, 2),
        today_bank_sales_in=bank_sales_in,
        today_other_bank_in=round(today_other_bank_in, 2),
        today_bank_expenses=bank_expenses,
        expected_balance=expected,
        today_bank_balance=round(today_bank_balance, 2),
        today_fone_pay_balance=round(today_fone_pay_balance, 2),
        actual_balance=actual,
        difference=difference,
        status=recon_status,
        created_by=created_by,
        updated_by=created_by,
        created_at=now,
        updated_at=now,
    )
    await doc.insert()
    return doc
