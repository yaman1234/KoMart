from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime


class ShiftCreate(BaseModel):
    name: str
    code: str
    start_time: str  # HH:MM
    end_time: str    # HH:MM
    grace_period_minutes: int = 15
    half_day_threshold_minutes: int = 240
    full_day_threshold_minutes: int = 420
    break_allowance_minutes: int = 60
    color_code: str = "#2563EB"
    days_of_week: List[int] = Field(default_factory=lambda: [0, 1, 2, 3, 4, 5, 6])
    is_active: bool = True


class ShiftUpdate(BaseModel):
    name: Optional[str] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    grace_period_minutes: Optional[int] = None
    half_day_threshold_minutes: Optional[int] = None
    full_day_threshold_minutes: Optional[int] = None
    break_allowance_minutes: Optional[int] = None
    color_code: Optional[str] = None
    days_of_week: Optional[List[int]] = None
    is_active: Optional[bool] = None


class ShiftResponse(BaseModel):
    id: str
    name: str
    code: str
    start_time: str
    end_time: str
    grace_period_minutes: int
    half_day_threshold_minutes: int
    full_day_threshold_minutes: int
    break_allowance_minutes: int
    color_code: str
    days_of_week: List[int]
    is_active: bool
    created_at: datetime
    updated_at: datetime


class ShiftAssignmentCreate(BaseModel):
    user_id: str
    shift_id: str
    effective_from: str  # YYYY-MM-DD
    effective_to: Optional[str] = None


class ShiftAssignmentUpdate(BaseModel):
    shift_id: Optional[str] = None
    effective_from: Optional[str] = None
    effective_to: Optional[str] = None


class ShiftAssignmentResponse(BaseModel):
    id: str
    user_id: str
    user_name: str
    shift_id: str
    shift_name: str
    effective_from: str
    effective_to: Optional[str] = None
    assigned_by: str
    created_at: datetime
