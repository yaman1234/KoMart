from pydantic import BaseModel, Field
from typing import Optional
from app.models.purchase_order import POStatus, PurchaseOrderItem, line_status, LineStatus


class PurchaseOrderItemResponse(BaseModel):
    product_id: str
    product_name: str
    quantity: int
    unit_cost: float
    received_quantity: int
    order_uom: str = "pcs"
    base_uom: str = "pcs"
    units_per_buy_uom: int = 1
    line_status: LineStatus


def item_to_response(item: PurchaseOrderItem) -> PurchaseOrderItemResponse:
    return PurchaseOrderItemResponse(
        product_id=item.product_id,
        product_name=item.product_name,
        quantity=item.quantity,
        unit_cost=item.unit_cost,
        received_quantity=item.received_quantity,
        order_uom=getattr(item, "order_uom", None) or "pcs",
        base_uom=getattr(item, "base_uom", None) or "pcs",
        units_per_buy_uom=getattr(item, "units_per_buy_uom", None) or 1,
        line_status=line_status(item),
    )


class PurchaseOrderCreate(BaseModel):
    supplier_id: str
    supplier_name: str
    items: list[PurchaseOrderItem]
    total_amount: float = Field(ge=0)
    expected_delivery: Optional[str] = None
    status: POStatus = POStatus.draft
    ordered_by: Optional[str] = None


class PurchaseOrderUpdate(BaseModel):
    supplier_id: str
    supplier_name: str
    items: list[PurchaseOrderItem]
    total_amount: float = Field(ge=0)
    expected_delivery: Optional[str] = None
    status: POStatus = POStatus.draft
    ordered_by: Optional[str] = None


class PurchaseOrderStatusUpdate(BaseModel):
    status: POStatus


class PurchaseOrderReceiveItem(BaseModel):
    product_id: str
    receive_quantity: int = Field(ge=1)
    expiry_date: Optional[str] = None
    units_per_buy_uom: int | None = Field(default=None, ge=1)


class PurchaseOrderReceiveRequest(BaseModel):
    items: list[PurchaseOrderReceiveItem]


class PurchaseOrderResponse(BaseModel):
    id: str
    order_number: str
    supplier_id: str
    supplier_name: str
    status: POStatus
    items: list[PurchaseOrderItemResponse]
    total_amount: float
    expected_delivery: Optional[str]
    ordered_by: Optional[str]
    received_by: Optional[str]
    received_date: Optional[str]
    created_at: str
    updated_at: str


class PurchaseOrderListResponse(BaseModel):
    data: list[PurchaseOrderResponse]
    total: int
    page: int
    page_size: int
    total_pages: int
    received_total_amount: float = 0.0
