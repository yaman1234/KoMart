from pydantic import BaseModel, Field
from typing import Optional
from app.models.expense import ExpenseCategory


class ExpenseCreate(BaseModel):
    title:          str
    description:    Optional[str] = None
    amount:         float = Field(ge=0)
    category:       ExpenseCategory
    date:           str
    paid_to:        Optional[str] = None
    payment_method: Optional[str] = None
    is_setup_cost:  bool = False


class ExpenseUpdate(BaseModel):
    title:          Optional[str] = None
    description:    Optional[str] = None
    amount:         Optional[float] = Field(default=None, ge=0)
    category:       Optional[ExpenseCategory] = None
    date:           Optional[str] = None
    paid_to:        Optional[str] = None
    payment_method: Optional[str] = None
    is_setup_cost:  Optional[bool] = None


class ExpenseResponse(BaseModel):
    id:             str
    title:          str
    description:    Optional[str]
    amount:         float
    category:       ExpenseCategory
    date:           str
    paid_to:        Optional[str]
    payment_method: Optional[str]
    is_setup_cost:  bool
    created_at:     str
    updated_at:     str


class ExpenseStatsResponse(BaseModel):
    total_expenses: float
    this_month: float
    setup_investment: float
