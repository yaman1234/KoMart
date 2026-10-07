from beanie import Document
from pydantic import BaseModel, Field
from datetime import datetime, timezone
from typing import List, Optional
from enum import Enum
from pymongo import IndexModel, ASCENDING, DESCENDING


class CashReconciliationStatus(str, Enum):
    reconciled = "reconciled"
    difference = "difference"


class CashDenomination(BaseModel):
    denomination: int
    quantity: int
    amount: float


class CashReconciliation(Document):
    date: str  # YYYY-MM-DD, unique
    is_initial: bool = False
    # Opening cash (previous day's closing or manually entered on first record)
    opening_cash: float = Field(default=0.0, ge=0)
    # Auto-computed from transactions/expenses/ledger
    today_cash_sales_in: float = Field(default=0.0, ge=0)
    today_cash_expenses: float = Field(default=0.0, ge=0)
    today_transfers_in: float = Field(default=0.0, ge=0)
    today_transfers_out: float = Field(default=0.0, ge=0)
    today_adjustments_in: float = Field(default=0.0, ge=0)
    today_adjustments_out: float = Field(default=0.0, ge=0)
    today_other_cash_in: float = Field(default=0.0, ge=0)
    today_custody_in: float = Field(default=0.0, ge=0)
    today_custody_out: float = Field(default=0.0, ge=0)
    # Computed
    expected_closing_cash: float = 0.0
    # User-entered actual physical cash count
    actual_closing_cash: float = Field(default=0.0, ge=0)
    difference: float = 0.0
    status: CashReconciliationStatus = CashReconciliationStatus.reconciled
    notes: Optional[str] = None
    cash_count_mode: Optional[str] = None  # 'direct' | 'denomination'
    denominations: Optional[List[CashDenomination]] = None
    created_by: str = ""
    updated_by: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "cash_reconciliations"
        indexes = [
            IndexModel([("date", ASCENDING)], unique=True),
            IndexModel([("date", DESCENDING)]),
        ]
