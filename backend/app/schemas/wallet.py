"""Schemas for wallet ledger / accounts APIs."""

from pydantic import BaseModel, Field
from typing import Optional


WALLETS = ("cash", "bank", "esewa")


class WalletBalance(BaseModel):
    wallet: str
    balance: float


class WalletBalancesResponse(BaseModel):
    cash: float
    bank: float
    esewa: float
    as_of: str


class WalletLedgerEntryResponse(BaseModel):
    id: str
    date: str
    wallet: str
    direction: str
    amount: float
    entry_type: str
    remarks: str = ""
    reference_type: str = ""
    reference_id: str = ""
    transfer_id: str = ""
    created_by: str = ""
    created_at: str = ""


class WalletTransferCreate(BaseModel):
    from_wallet: str
    to_wallet: str
    amount: float = Field(gt=0)
    date: str
    remarks: str = Field(min_length=1, max_length=500)


class WalletAdjustmentCreate(BaseModel):
    wallet: str
    amount: float = Field(gt=0)
    direction: str = Field(description="'in' or 'out'")
    date: str
    remarks: str = Field(min_length=1, max_length=500)


class WalletDayBookBlock(BaseModel):
    wallet: str
    opening: float
    sales_in: float = 0.0
    expenses_out: float = 0.0
    transfers_in: float = 0.0
    transfers_out: float = 0.0
    adjustments_in: float = 0.0
    adjustments_out: float = 0.0
    expected: float
    closing: float | None = None
    variance: float | None = None
    variance_posted: bool = False
