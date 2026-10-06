from beanie import Document
from pydantic import Field
from datetime import datetime, timezone
from typing import Optional
from enum import Enum
from pymongo import IndexModel, ASCENDING, DESCENDING


class ReconciliationStatus(str, Enum):
    reconciled = "reconciled"
    difference = "difference"


class BankReconciliation(Document):
    date: str  # YYYY-MM-DD, unique
    is_initial: bool = False
    previous_bank_balance: float = Field(default=0.0, ge=0)
    previous_fone_pay_balance: float = Field(default=0.0, ge=0)
    today_bank_sales_in: float = Field(default=0.0, ge=0)
    today_other_bank_in: float = Field(default=0.0, ge=0)
    today_bank_expenses: float = Field(default=0.0, ge=0)
    today_transfers_in: float = Field(default=0.0, ge=0)
    today_transfers_out: float = Field(default=0.0, ge=0)
    today_adjustments_in: float = Field(default=0.0, ge=0)
    today_adjustments_out: float = Field(default=0.0, ge=0)
    today_custody_in: float = Field(default=0.0, ge=0)
    today_custody_out: float = Field(default=0.0, ge=0)
    expected_balance: float = 0.0
    today_bank_balance: float = Field(default=0.0, ge=0)
    today_fone_pay_balance: float = Field(default=0.0, ge=0)
    actual_balance: float = 0.0
    difference: float = 0.0
    status: ReconciliationStatus = ReconciliationStatus.reconciled
    notes: Optional[str] = None
    created_by: str = ""
    updated_by: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "bank_reconciliations"
        indexes = [
            IndexModel([("date", ASCENDING)], unique=True),
            IndexModel([("date", DESCENDING)]),
        ]
