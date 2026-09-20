from beanie import Document
from pydantic import BaseModel, Field
from typing import Optional
from enum import Enum
from datetime import datetime, timezone
from pymongo import IndexModel, ASCENDING, DESCENDING


class StockCountStatus(str, Enum):
    draft = "draft"
    counting = "counting"
    submitted = "submitted"
    under_review = "under_review"
    recount_required = "recount_required"
    approved = "approved"
    completed = "completed"
    cancelled = "cancelled"


class CountType(str, Enum):
    full = "full"
    category = "category"
    section = "section"
    selected = "selected"


class CountMode(str, Enum):
    blind = "blind"
    assisted = "assisted"


class StockCountItem(BaseModel):
    product_id: str
    product_name: str = ""
    sku: str = ""
    barcode: str = ""
    category: str = ""
    uom: str = ""
    unit_cost: float = 0.0
    snapshot_qty: int = 0          # frozen at count start
    physical_qty: Optional[int] = None
    recount_qty: Optional[int] = None
    final_qty: Optional[int] = None
    variance_qty: Optional[int] = None   # physical - snapshot
    variance_value: Optional[float] = None
    reason: str = ""
    reason_note: str = ""
    counted_by: str = ""
    counted_at: Optional[datetime] = None
    recounted_by: str = ""
    recounted_at: Optional[datetime] = None


class StockCountAuditEntry(BaseModel):
    action: str
    user_name: str = ""
    user_id: str = ""
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    note: str = ""


class StockCount(Document):
    count_number: str = ""          # SC-YYYY-NNNN
    status: StockCountStatus = StockCountStatus.draft
    count_type: CountType = CountType.full
    count_mode: CountMode = CountMode.blind
    category_filter: str = ""       # if count_type == category
    notes: str = ""
    items: list[StockCountItem] = Field(default_factory=list)
    audit_trail: list[StockCountAuditEntry] = Field(default_factory=list)
    # snapshot metadata
    snapshot_taken_at: Optional[datetime] = None
    # summary (computed on submit/approve)
    total_products: int = 0
    counted_products: int = 0
    matched_count: int = 0
    short_count: int = 0
    excess_count: int = 0
    shortage_value: float = 0.0
    excess_value: float = 0.0
    net_variance_value: float = 0.0
    stock_accuracy_pct: float = 0.0
    # workflow
    created_by: str = ""
    created_by_id: str = ""
    approved_by: str = ""
    approved_by_id: str = ""
    adjustment_id: str = ""         # reference to batch of stock adjustments
    count_date: str = ""            # YYYY-MM-DD
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "stock_counts"
        indexes = [
            IndexModel([("count_number", ASCENDING)], unique=True, sparse=True),
            IndexModel([("status", ASCENDING), ("created_at", DESCENDING)]),
            IndexModel([("created_at", DESCENDING)]),
            IndexModel([("count_date", DESCENDING)]),
        ]
