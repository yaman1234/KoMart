from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime

from app.models.attendance import LeaveType, LeaveStatus


class LeaveCreate(BaseModel):
    leave_type: LeaveType
    start_date: str  # YYYY-MM-DD
    end_date: str    # YYYY-MM-DD
    is_half_day: bool = False
    days_count: float = 1.0
    reason: str


class LeaveReviewRequest(BaseModel):
    decision: str  # "approved" | "rejected"
    rejection_reason: Optional[str] = None


class LeaveResponse(BaseModel):
    id: str
    user_id: str
    user_name: str
    leave_type: LeaveType
    start_date: str
    end_date: str
    days_count: float
    is_half_day: bool
    reason: str
    status: LeaveStatus
    reviewed_by: Optional[str] = None
    reviewed_by_name: Optional[str] = None
    reviewed_at: Optional[datetime] = None
    rejection_reason: Optional[str] = None
    created_at: datetime
