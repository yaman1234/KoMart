from motor.motor_asyncio import AsyncIOMotorClient
from beanie import init_beanie

from app.config import settings
from app.models.product import ProductStatus
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
    Expense,
    Category,
    RefreshToken,
    AuditLog,
    DiscountRule,
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
            Expense,
            Category,
            RefreshToken,
            AuditLog,
            DiscountRule,
        ],
    )
    # Backfill legacy products created before status field existed.
    await Product.get_motor_collection().update_many(
        {"$or": [{"status": {"$exists": False}}, {"status": None}]},
        {"$set": {"status": ProductStatus.active.value}},
    )
