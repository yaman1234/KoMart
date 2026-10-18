from pydantic import BaseModel, Field
from typing import Optional


class ExpenseCreate(BaseModel):
    title: str
    description: Optional[str] = None
    amount: float = Field(ge=0)
    category: str
    date: str
    paid_to: Optional[str] = None
    bill_no: Optional[str] = None
    payment_method: Optional[str] = None
    is_setup_cost: bool = False
    purchase_order_id: Optional[str] = None


class ExpenseUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    amount: Optional[float] = Field(default=None, ge=0)
    category: Optional[str] = None
    date: Optional[str] = None
    paid_to: Optional[str] = None
    bill_no: Optional[str] = None
    payment_method: Optional[str] = None
    is_setup_cost: Optional[bool] = None


class ExpenseResponse(BaseModel):
    id: str
    title: str
    description: Optional[str]
    amount: float
    category: str
    date: str
    paid_to: Optional[str]
    bill_no: Optional[str] = None
    payment_method: Optional[str]
    is_setup_cost: bool
    purchase_order_id: Optional[str] = None
    items: Optional[list[dict]] = None
    created_at: str
    updated_at: str


class ExpenseStatsResponse(BaseModel):
    total_expenses: float
    this_month: float
    setup_investment: float
    operating_expenses: float = 0.0
    expense_count: int = 0


class ProductConsumptionItemRequest(BaseModel):
    product_id: str
    quantity: int = Field(gt=0, description="Quantity of product consumed")


class ProductConsumptionCreate(BaseModel):
    items: list[ProductConsumptionItemRequest] = Field(min_length=1)
    staff_name: str = Field(min_length=1, description="Staff or manager who consumed or authorized items")
    category: str = "supplies"
    date: str
    remarks: Optional[str] = None
    bill_no: Optional[str] = None
