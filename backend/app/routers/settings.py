from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from pydantic import ConfigDict
from typing import Optional

from app.auth.dependencies import get_current_user, require_admin_only
from app.models.user import User
from app.models.settings import StoreSettings

router = APIRouter(prefix="/settings", tags=["Settings"])


class SettingsUpdate(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    store_name: Optional[str] = Field(None, alias="storeName")
    address: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    currency: Optional[str] = None
    tax_rate: Optional[float] = Field(None, alias="taxRate")
    tax_inclusive: Optional[bool] = Field(None, alias="taxInclusive")
    loyalty_points_per_currency: Optional[int] = Field(None, alias="loyaltyPointsPerCurrency")


@router.get("")
async def get_settings(_: User = Depends(get_current_user)):
    settings = await StoreSettings.find_one()
    if not settings:
        settings = StoreSettings()
        await settings.insert()
    return {
        "storeName": settings.store_name,
        "address": settings.address,
        "phone": settings.phone,
        "email": settings.email,
        "currency": settings.currency,
        "taxRate": settings.tax_rate,
        "taxInclusive": settings.tax_inclusive,
        "loyaltyPointsPerCurrency": settings.loyalty_points_per_currency,
    }


@router.patch("")
async def update_settings(body: SettingsUpdate, _: User = Depends(require_admin_only)):
    settings = await StoreSettings.find_one()
    if not settings:
        settings = StoreSettings()
        await settings.insert()
    update_data = {k: v for k, v in body.model_dump().items() if v is not None}
    if update_data:
        await settings.set(update_data)
    return {"message": "Settings updated"}
