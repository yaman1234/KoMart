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
    Expense,
    Category,
)

# Module-level flag — one Motor client per Lambda container (process)
_initialized: bool = False
_motor_client: AsyncIOMotorClient | None = None


async def init_db() -> None:
    """Initialize Beanie + Motor.  Safe to call multiple times — no-op after first call."""
    global _initialized, _motor_client

    if _initialized:
        return

    _motor_client = AsyncIOMotorClient(
        settings.mongo_url,
        serverSelectionTimeoutMS=8_000,  # fail fast rather than hang
        connectTimeoutMS=8_000,
    )
    await init_beanie(
        database=_motor_client[settings.mongo_db_name],
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
        ],
    )
    _initialized = True
