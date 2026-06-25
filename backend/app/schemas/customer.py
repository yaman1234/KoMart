from pydantic import BaseModel
from typing import Optional
from app.models.customer import MembershipTier


class CustomerCreate(BaseModel):
    name: str
    phone: str
    email: str = ""
    birthday: Optional[str] = None


class CustomerUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    birthday: Optional[str] = None


class CustomerResponse(BaseModel):
    id: str
    name: str
    phone: str
    email: str
    birthday: Optional[str]
    loyalty_points: int
    membership_tier: MembershipTier
    total_spent: float
    created_at: str
