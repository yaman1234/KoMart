from motor.motor_asyncio import AsyncIOMotorClient
from beanie import init_beanie

from app.config import settings
from app.models import (
    User,
    Product,
    InventoryBatch,
    StockAdjustment,
    Supplier,
    PurchaseOrder,
    Customer,
    Transaction,
    Notification,
    StoreSettings,
)


async def init_db() -> None:
    client = AsyncIOMotorClient(settings.mongo_url)
    await init_beanie(
        database=client[settings.mongo_db_name],
        document_models=[
            User,
            Product,
            InventoryBatch,
            StockAdjustment,
            Supplier,
            PurchaseOrder,
            Customer,
            Transaction,
            Notification,
            StoreSettings,
        ],
    )
