from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime
from app.models.stock_count import StockCountStatus, CountType, CountMode


class StockCountCreateRequest(BaseModel):
    count_type: CountType = CountType.full
    count_mode: CountMode = CountMode.blind
    category_filter: str = ""
    product_ids: list[str] = Field(default_factory=list)  # for selected type
    notes: str = ""
    count_date: str = ""  # YYYY-MM-DD; defaults to today


class CountItemUpdate(BaseModel):
    product_id: str
    physical_qty: int = Field(ge=0)
    counted_by: str = ""


class RecountItemUpdate(BaseModel):
    product_id: str
    recount_qty: int = Field(ge=0)
    recounted_by: str = ""


class VarianceReasonUpdate(BaseModel):
    product_id: str
    reason: str
    reason_note: str = ""
    final_qty: Optional[int] = None  # manager can override final qty


class ApproveRequest(BaseModel):
    notes: str = ""


class StockCountItemResponse(BaseModel):
    product_id: str
    product_name: str
    sku: str
    barcode: str
    category: str
    uom: str
    unit_cost: float
    snapshot_qty: int
    physical_qty: Optional[int]
    recount_qty: Optional[int]
    final_qty: Optional[int]
    variance_qty: Optional[int]
    variance_value: Optional[float]
    reason: str
    reason_note: str
    counted_by: str
    counted_at: Optional[str]
    recounted_by: str
    recounted_at: Optional[str]


class StockCountAuditEntryResponse(BaseModel):
    action: str
    user_name: str
    user_id: str
    timestamp: str
    note: str


class StockCountResponse(BaseModel):
    id: str
    count_number: str
    status: StockCountStatus
    count_type: CountType
    count_mode: CountMode
    category_filter: str
    notes: str
    items: list[StockCountItemResponse]
    audit_trail: list[StockCountAuditEntryResponse]
    snapshot_taken_at: Optional[str]
    total_products: int
    counted_products: int
    matched_count: int
    short_count: int
    excess_count: int
    shortage_value: float
    excess_value: float
    net_variance_value: float
    stock_accuracy_pct: float
    created_by: str
    approved_by: str
    adjustment_id: str
    count_date: str
    created_at: str
    updated_at: str


class StockCountListItem(BaseModel):
    id: str
    count_number: str
    status: StockCountStatus
    count_type: CountType
    count_mode: CountMode
    category_filter: str
    total_products: int
    counted_products: int
    matched_count: int
    short_count: int
    excess_count: int
    net_variance_value: float
    stock_accuracy_pct: float
    created_by: str
    approved_by: str
    adjustment_id: str
    count_date: str
    created_at: str


class StockCountListResponse(BaseModel):
    data: list[StockCountListItem]
    total: int
    page: int
    page_size: int
    total_pages: int
