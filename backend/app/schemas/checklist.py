from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime

from app.models.checklist import (
    ChecklistCategory,
    TargetRole,
    ChecklistStatus,
)


class TemplateItemSchema(BaseModel):
    id: str
    title: str
    description: Optional[str] = None
    is_mandatory: bool = True
    order: int = 1
    requires_numeric_input: bool = False
    numeric_unit: Optional[str] = None
    requires_note: bool = False


class ChecklistTemplateCreate(BaseModel):
    title: str
    description: Optional[str] = None
    category: ChecklistCategory = ChecklistCategory.opening
    target_role: TargetRole = TargetRole.cashier
    shift_id: Optional[str] = None
    shift_name: Optional[str] = None
    items: List[TemplateItemSchema] = Field(default_factory=list)
    is_active: bool = True
    auto_generate_daily: bool = True
    days_of_week: List[int] = Field(default_factory=lambda: [0, 1, 2, 3, 4, 5, 6])


class ChecklistTemplateUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    category: Optional[ChecklistCategory] = None
    target_role: Optional[TargetRole] = None
    shift_id: Optional[str] = None
    shift_name: Optional[str] = None
    items: Optional[List[TemplateItemSchema]] = None
    is_active: Optional[bool] = None
    auto_generate_daily: Optional[bool] = None
    days_of_week: Optional[List[int]] = None


class ChecklistTemplateResponse(BaseModel):
    id: str
    title: str
    description: Optional[str] = None
    category: ChecklistCategory
    target_role: TargetRole
    shift_id: Optional[str] = None
    shift_name: Optional[str] = None
    items: List[TemplateItemSchema]
    is_active: bool
    auto_generate_daily: bool
    days_of_week: List[int]
    created_by: str
    created_by_name: str
    created_at: datetime
    updated_at: datetime


class DailyChecklistItemSchema(BaseModel):
    id: str
    title: str
    description: Optional[str] = None
    is_mandatory: bool = True
    order: int = 1
    is_completed: bool = False
    completed_by_user_id: Optional[str] = None
    completed_by_name: Optional[str] = None
    completed_at: Optional[datetime] = None
    numeric_input: Optional[float] = None
    numeric_unit: Optional[str] = None
    notes: Optional[str] = None


class DailyChecklistResponse(BaseModel):
    id: str
    template_id: Optional[str] = None
    title: str
    description: Optional[str] = None
    category: ChecklistCategory
    date: str
    target_role: TargetRole
    assigned_to_user_id: Optional[str] = None
    assigned_to_user_name: Optional[str] = None
    assigned_by_user_id: str
    assigned_by_user_name: str
    shift_id: Optional[str] = None
    shift_name: Optional[str] = None
    items: List[DailyChecklistItemSchema]
    total_items_count: int
    completed_items_count: int
    completion_rate: float
    status: ChecklistStatus
    requires_manager_verification: bool = False
    verified_by_user_id: Optional[str] = None
    verified_by_name: Optional[str] = None
    verified_at: Optional[datetime] = None
    manager_remarks: Optional[str] = None
    completed_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime


class ChecklistItemToggleRequest(BaseModel):
    is_completed: bool
    numeric_input: Optional[float] = None
    notes: Optional[str] = None


class DailyChecklistCreate(BaseModel):
    title: str
    description: Optional[str] = None
    category: ChecklistCategory = ChecklistCategory.opening
    target_role: TargetRole = TargetRole.cashier
    assigned_to_user_id: Optional[str] = None
    shift_id: Optional[str] = None
    items: List[TemplateItemSchema] = Field(default_factory=list)


class ChecklistVerifyRequest(BaseModel):
    remarks: Optional[str] = None
