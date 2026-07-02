from pydantic import BaseModel, Field
from typing import Optional
from app.models.inventory import AdjustmentType


class BatchCreate(BaseModel):
    product_id: str
    batch_number: str
    quantity: int = Field(ge=1)
    expiry_date: Optional[str] = None   # ISO date string, e.g. "2026-12-31"


class BatchResponse(BaseModel):
    id: str
    product_id: str
    batch_number: str
    quantity: int
    unit_cost: float = 0.0
    expiry_date: Optional[str]
    purchase_order_id: Optional[str] = None
    received_at: str


class InventoryStatsResponse(BaseModel):
    total_skus: int
    low_stock: int
    out_of_stock: int
    expiring: int
    inventory_value: float


class InventoryItemResponse(BaseModel):
    id: str
    name: str
    sku: str
    barcode: str
    category: str
    supplier_id: str
    supplier_name: str
    stock: int
    low_stock_threshold: int
    cost_price: float
    selling_price: float
    batches: list[BatchResponse] = []
    batch_count: int = 0
    nearest_expiry: Optional[str] = None


class StockAdjustmentCreate(BaseModel):
    product_id: str
    batch_id: Optional[str] = None
    type: AdjustmentType
    quantity: int
    reason: str


class StockAdjustmentResponse(BaseModel):
    id: str
    product_id: str
    product_name: str = ""
    batch_id: Optional[str] = None
    transaction_id: Optional[str] = None
    type: AdjustmentType
    quantity: int
    stock_before: int = 0
    stock_after: int = 0
    unit_cost: float = 0.0
    extended_cost: float = 0.0
    unit_selling_price: float = 0.0
    extended_revenue: float = 0.0
    source: str
    reason: str
    created_by: str
    created_at: str


class InventoryMovementResponse(BaseModel):
    id: str
    product_id: str
    product_name: str
    product_sku: str
    batch_id: Optional[str] = None
    transaction_id: Optional[str] = None
    reference_type: str
    reference_id: str
    reference_label: str
    transaction_number: str = ""
    type: str
    direction: str
    movement_label: str
    quantity: int
    stock_before: int
    stock_after: int
    unit_cost: float = 0.0
    extended_cost: float = 0.0
    unit_selling_price: float = 0.0
    extended_revenue: float = 0.0
    reason: str
    created_by: str
    created_at: str


class MovementSummaryResponse(BaseModel):
    movement_count: int
    total_in: int
    total_out: int
