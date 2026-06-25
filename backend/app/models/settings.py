from beanie import Document
from pydantic import Field


class StoreSettings(Document):
    store_name: str = "KoMart"
    address: str = ""
    phone: str = ""
    email: str = ""
    currency: str = "NPR"
    tax_rate: float = 13.0
    tax_inclusive: bool = False
    loyalty_points_per_currency: int = 100

    class Settings:
        name = "store_settings"
