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


async def _drop_conflicting_indexes(db) -> None:
    """Drop old indexes whose options changed (e.g. non-unique → unique)."""
    migrations = [
        ("users", "email_1"),
        ("purchase_orders", "order_number_1"),
        ("discount_rules", "code_1"),
        ("refresh_tokens", "expires_at_1"),
    ]
    for collection_name, index_name in migrations:
        try:
            await db[collection_name].drop_index(index_name)
        except Exception:
            pass  # index doesn't exist or already dropped


async def init_db() -> None:
    client = AsyncIOMotorClient(settings.mongo_url)
    db = client[settings.mongo_db_name]

    await _drop_conflicting_indexes(db)

    await init_beanie(
        database=db,
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
