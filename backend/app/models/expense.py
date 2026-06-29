from beanie import Document
from pydantic import Field
from typing import Optional
from datetime import datetime, timezone
from enum import Enum
from pymongo import DESCENDING, ASCENDING, IndexModel


class ExpenseCategory(str, Enum):
    setup_investment = "setup_investment"
    rent             = "rent"
    utilities        = "utilities"
    salaries         = "salaries"
    marketing        = "marketing"
    supplies         = "supplies"
    maintenance      = "maintenance"
    equipment        = "equipment"
    other            = "other"


class Expense(Document):
    title:          str
    description:    Optional[str] = None
    amount:         float = Field(ge=0)
    category:       ExpenseCategory
    date:           str  # ISO date "YYYY-MM-DD"
    paid_to:        Optional[str] = None
    payment_method: Optional[str] = None
    is_setup_cost:  bool = False
    created_at:     datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at:     datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "expenses"
        indexes = [
            IndexModel([("date", DESCENDING)]),
            IndexModel([("category", ASCENDING), ("date", DESCENDING)]),
            IndexModel([("is_setup_cost", ASCENDING)]),
        ]
