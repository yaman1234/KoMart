from pydantic import BaseModel, Field
from typing import Optional
from app.models.purchase_order import POStatus, PurchaseOrderItem, line_status, LineStatus


class PurchaseOrderItemResponse(BaseModel):
    product_id: str
    product_name: str
    quantity: int
    unit_cost: float
    received_quantity: int
    line_status: LineStatus


def item_to_response(item: PurchaseOrderItem) -> PurchaseOrderItemResponse:
    return PurchaseOrderItemResponse(
        product_id=item.product_id,
        product_name=item.product_name,
        quantity=item.quantity,
        unit_cost=item.unit_cost,
        received_quantity=item.received_quantity,
        line_status=line_status(item),
    )


class PurchaseOrderCreate(BaseModel):
    supplier_id: str
    supplier_name: str
    items: list[PurchaseOrderItem]
    total_amount: float = Field(ge=0)
    expected_delivery: Optional[str] = None
    status: POStatus = POStatus.draft


class PurchaseOrderUpdate(BaseModel):
    supplier_id: str
    supplier_name: str
    items: list[PurchaseOrderItem]
    total_amount: float = Field(ge=0)
    expected_delivery: Optional[str] = None
    status: POStatus = POStatus.draft


class PurchaseOrderStatusUpdate(BaseModel):
    status: POStatus


class PurchaseOrderReceiveItem(BaseModel):
    product_id: str
    receive_quantity: int = Field(ge=1)
    expiry_date: str


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
