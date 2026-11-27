from beanie import Document
from pydantic import BaseModel, Field
from datetime import datetime, timezone
from typing import List, Optional


class AttendanceConfig(BaseModel):
    attendance_enabled: bool = True
    enforce_store_ip: bool = False
    allowed_ips: List[str] = Field(default_factory=list)
    default_shift_id: Optional[str] = None
    require_clock_in_for_pos: bool = False
    auto_clock_out_hours: int = Field(default=14, ge=1, le=24)


class StoreSettings(Document):
    # Store / legal
    store_name: str = "KoMart"
    address: str = ""
    phone: str = ""
    email: str = ""
    logo_url: str = ""
    pan: str = ""
    vat_number: str = ""

    # Tax & currency
    currency: str = "NPR"
    tax_rate: float = Field(default=13.0, ge=0, le=100)
    tax_inclusive: bool = False

    # POS / receipts
    receipt_header: str = ""
    receipt_footer: str = ""
    auto_print: bool = False
    default_payment_method: str = "cash"

    # Inventory defaults
    default_low_stock_threshold: int = Field(default=10, ge=0)
    expiry_warning_days: int = Field(default=30, ge=0)
    auto_sku: bool = False
    barcode_format: str = "any"

    # Business / loyalty
    loyalty_points_per_currency: int = Field(default=100, ge=0)
    loyalty_redeem_rate: int = Field(default=1, ge=0)
    transaction_prefix: str = "TXN"
    purchase_order_prefix: str = "PO"

    # Appearance
    date_format: str = "en-US"
    time_format: str = "12h"
    calendar_system: str = "BS"  # "AD" | "BS"

    # Fiscal year (Nepal default ≈ Shrawan 1 / mid-July)
    fiscal_year_start_month: int = Field(default=7, ge=1, le=12)
    fiscal_year_start_day: int = Field(default=16, ge=1, le=31)

    # Cash/Bank baselines for wallet legs of dashboard KPI / Accounts
    opening_cash_balance: float = Field(default=0.0, ge=0)
    opening_bank_balance: float = Field(default=0.0, ge=0)
    opening_esewa_balance: float = Field(default=0.0, ge=0)

    # Attendance & workforce settings
    attendance_config: AttendanceConfig = Field(default_factory=AttendanceConfig)

    # Timestamps
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "store_settings"
