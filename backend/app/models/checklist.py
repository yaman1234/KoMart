from beanie import Document, Indexed
from pydantic import BaseModel, Field
from typing import List, Optional
from enum import Enum
from datetime import datetime, timezone
from pymongo import IndexModel, ASCENDING, DESCENDING


class ChecklistCategory(str, Enum):
    opening = "opening"
    mid_day = "mid_day"
    closing = "closing"
    hygiene_safety = "hygiene_safety"
    inventory = "inventory"
    general = "general"


class TargetRole(str, Enum):
    cashier = "cashier"
    manager = "manager"
    all = "all"


class TemplateItem(BaseModel):
    id: str  # item-01
    title: str  # e.g., "Verify Opening Cash Float"
    description: Optional[str] = None
    is_mandatory: bool = True
    order: int = 1
    requires_numeric_input: bool = False  # e.g. record float cash or fridge temp
    numeric_unit: Optional[str] = None    # "NPR", "°C", "Units"
    requires_note: bool = False


class ChecklistTemplate(Document):
    title: str  # e.g. "Cashier Morning Register Checklist"
    description: Optional[str] = None
    category: ChecklistCategory = ChecklistCategory.opening
    target_role: TargetRole = TargetRole.cashier

    # Specific shift or general
    shift_id: Optional[str] = None  # None = applies to any shift
    shift_name: Optional[str] = None

    items: List[TemplateItem] = Field(default_factory=list)

    # Recurrence rules
    is_active: bool = True
    auto_generate_daily: bool = True
    days_of_week: List[int] = Field(default_factory=lambda: [0, 1, 2, 3, 4, 5, 6])  # 0=Mon, 6=Sun

    created_by: str
    created_by_name: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "checklist_templates"
        indexes = [
            IndexModel([("target_role", ASCENDING), ("is_active", ASCENDING)]),
            IndexModel([("category", ASCENDING)]),
            IndexModel([("is_active", ASCENDING)]),
        ]


class ChecklistStatus(str, Enum):
    pending = "pending"
    in_progress = "in_progress"
    completed = "completed"
    overdue = "overdue"


class DailyChecklistItem(BaseModel):
    id: str
    title: str
    description: Optional[str] = None
    is_mandatory: bool = True
    order: int = 1

    # Execution State
    is_completed: bool = False
    completed_by_user_id: Optional[str] = None
    completed_by_name: Optional[str] = None
    completed_at: Optional[datetime] = None

    # Optional Values
    numeric_input: Optional[float] = None
    numeric_unit: Optional[str] = None
    notes: Optional[str] = None


class DailyChecklist(Document):
    template_id: Optional[str] = None  # Reference to template if generated from one
    title: str
    description: Optional[str] = None
    category: ChecklistCategory = ChecklistCategory.opening
    date: Indexed(str)  # YYYY-MM-DD

    # Assignment
    target_role: TargetRole = TargetRole.cashier
    assigned_to_user_id: Optional[str] = None  # None = broadcast to all with target_role
    assigned_to_user_name: Optional[str] = None
    assigned_by_user_id: str
    assigned_by_user_name: str

    # Shift Linkage
    shift_id: Optional[str] = None
    shift_name: Optional[str] = None

    # Items & Progress
    items: List[DailyChecklistItem] = Field(default_factory=list)
    total_items_count: int = 0
    completed_items_count: int = 0
    completion_rate: float = 0.0  # 0.0 to 100.0%
    status: ChecklistStatus = ChecklistStatus.pending

    # Manager Verification / Sign-Off
    requires_manager_verification: bool = False
    verified_by_user_id: Optional[str] = None
    verified_by_name: Optional[str] = None
    verified_at: Optional[datetime] = None
    manager_remarks: Optional[str] = None

    completed_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "daily_checklists"
        indexes = [
            IndexModel([("date", ASCENDING), ("target_role", ASCENDING)]),
            IndexModel([("date", ASCENDING), ("assigned_to_user_id", ASCENDING)]),
            IndexModel([("date", ASCENDING), ("status", ASCENDING)]),
            IndexModel([("date", DESCENDING)]),
        ]
