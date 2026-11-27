from motor.motor_asyncio import AsyncIOMotorClient
from beanie import init_beanie
import os

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
    ExpenseCategoryDoc,
    Category,
    Uom,
    RefreshToken,
    AuditLog,
    DiscountRule,
    DayClose,
    PriceHistory,
    WalletLedgerEntry,
    CacheEntry,
    CashCustody,
    StockCount,
    PurchasePriceHistory,
    PurchaseReturn,
    AttendanceRecord,
    Shift,
    ShiftAssignment,
    LeaveRequest,
    ChecklistTemplate,
    DailyChecklist,
)
from app.models.bank_reconciliation import BankReconciliation
from app.models.cash_reconciliation import CashReconciliation

_motor_client: AsyncIOMotorClient | None = None


def get_motor_client() -> AsyncIOMotorClient:
    if _motor_client is None:
        raise RuntimeError("Database not initialized — call init_db() first")
    return _motor_client


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


async def _run_startup_migrations() -> None:
    """One-time data backfills — run via CLI/local start, not every Vercel cold start."""
    # Backfill legacy products created before status field existed.
    await Product.get_motor_collection().update_many(
        {"$or": [{"status": {"$exists": False}}, {"status": None}]},
        {"$set": {"status": ProductStatus.active.value}},
    )
    # Backfill UOM fields on legacy products.
    await Product.get_motor_collection().update_many(
        {"buy_uom": {"$exists": False}},
        [{"$set": {
            "buy_uom": {"$ifNull": ["$uom", "pcs"]},
            "units_per_buy_uom": 1,
            "sell_mode": "unit",
        }}],
    )
    await Product.get_motor_collection().update_many(
        {"pack_selling_price": {"$exists": False}},
        {"$set": {"pack_selling_price": 0.0}},
    )
    # Rename legacy payment method card → bank.
    await Transaction.get_motor_collection().update_many(
        {"payment_method": "card"},
        {"$set": {"payment_method": "bank"}},
    )
    await Expense.get_motor_collection().update_many(
        {"payment_method": "card"},
        {"$set": {"payment_method": "bank"}},
    )
    await StoreSettings.get_motor_collection().update_many(
        {"default_payment_method": "card"},
        {"$set": {"default_payment_method": "bank"}},
    )
    await _seed_default_uoms()
    await _seed_default_expense_categories()
    # Assign 2-digit category codes + seed SKU sequences for 6-digit CCNNNN SKUs.
    from app.services.sku import backfill_category_sku_codes
    await backfill_category_sku_codes()
    # Seed wallet ledger from historical sales/expenses once (idempotent).
    from app.services.wallet_ledger import ensure_backfill
    await ensure_backfill(created_by="system")
    await _seed_default_shifts()
    await _seed_default_checklist_templates()


async def init_db() -> None:
    """Connect Motor + Beanie. Heavy migrations are skipped on Vercel cold starts."""
    global _motor_client
    on_vercel = bool(os.getenv("VERCEL"))
    motor_kwargs: dict = {
        "serverSelectionTimeoutMS": 5_000,
        "connectTimeoutMS": 10_000,
        "socketTimeoutMS": 20_000,
        # Serverless: small pool; local/dev can use a larger pool.
        "maxPoolSize": 10 if on_vercel else 50,
        "minPoolSize": 0,
    }
    if on_vercel:
        motor_kwargs["maxIdleTimeMS"] = 30_000
    _motor_client = AsyncIOMotorClient(settings.mongo_url, **motor_kwargs)
    client = _motor_client
    db = client[settings.mongo_db_name]

    run_migrations = not settings.skip_startup_migrations
    if run_migrations:
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
            ExpenseCategoryDoc,
            Category,
            Uom,
            RefreshToken,
            AuditLog,
            DiscountRule,
            DayClose,
            PriceHistory,
            WalletLedgerEntry,
            CacheEntry,
            CashCustody,
            StockCount,
            PurchasePriceHistory,
            PurchaseReturn,
            BankReconciliation,
            CashReconciliation,
            AttendanceRecord,
            Shift,
            ShiftAssignment,
            LeaveRequest,
            ChecklistTemplate,
            DailyChecklist,
        ],
    )

    if run_migrations:
        await _run_startup_migrations()


DEFAULT_UOMS: list[tuple[str, str]] = [
    ("pcs", "Pieces (pcs)"),
    ("pack", "Pack"),
    ("box", "Box"),
    ("bag", "Bag"),
    ("bottle", "Bottle"),
    ("can", "Can"),
    ("cup", "Cup"),
    ("dozen", "Dozen"),
    ("kg", "Kilogram (kg)"),
    ("g", "Gram (g)"),
    ("L", "Liter (L)"),
    ("ml", "Milliliter (ml)"),
]


async def _seed_default_uoms() -> None:
    if await Uom.count() > 0:
        return
    for code, label in DEFAULT_UOMS:
        await Uom(code=code, label=label).insert()


async def _seed_default_expense_categories() -> None:
    from app.models.expense_category import DEFAULT_EXPENSE_CATEGORIES

    existing = {c.code for c in await ExpenseCategoryDoc.find_all().to_list()}
    for code, label in DEFAULT_EXPENSE_CATEGORIES:
        if code in existing:
            continue
        await ExpenseCategoryDoc(code=code, label=label).insert()


DEFAULT_SHIFTS: list[dict] = [
    {
        "name": "Morning Cashier Shift",
        "code": "MORN",
        "start_time": "08:00",
        "end_time": "16:00",
        "grace_period_minutes": 15,
        "half_day_threshold_minutes": 240,
        "full_day_threshold_minutes": 420,
        "break_allowance_minutes": 60,
        "color_code": "#2563EB",
    },
    {
        "name": "Evening Cashier Shift",
        "code": "EVE",
        "start_time": "14:00",
        "end_time": "21:30",
        "grace_period_minutes": 15,
        "half_day_threshold_minutes": 240,
        "full_day_threshold_minutes": 420,
        "break_allowance_minutes": 45,
        "color_code": "#7C3AED",
    },
    {
        "name": "General Store Shift",
        "code": "GEN",
        "start_time": "09:00",
        "end_time": "18:00",
        "grace_period_minutes": 15,
        "half_day_threshold_minutes": 240,
        "full_day_threshold_minutes": 480,
        "break_allowance_minutes": 60,
        "color_code": "#059669",
    },
]


async def _seed_default_shifts() -> None:
    for s in DEFAULT_SHIFTS:
        if await Shift.find_one(Shift.code == s["code"]) is None:
            await Shift(**s).insert()


async def _seed_default_checklist_templates() -> None:
    from app.models.checklist import (
        ChecklistCategory,
        TargetRole,
        TemplateItem,
    )

    if await ChecklistTemplate.count() > 0:
        return

    templates = [
        ChecklistTemplate(
            title="Cashier Morning Register Opening",
            description="Essential register setup and hardware check before first customer",
            category=ChecklistCategory.opening,
            target_role=TargetRole.cashier,
            items=[
                TemplateItem(
                    id="item-c-open-1",
                    title="Count & Verify Opening Float",
                    description="Count physical cash drawer notes/coins and verify Rs. 5,000 float",
                    is_mandatory=True,
                    order=1,
                    requires_numeric_input=True,
                    numeric_unit="NPR",
                ),
                TemplateItem(
                    id="item-c-open-2",
                    title="Barcode Scanner & Weighing Scale Test",
                    description="Scan test item and verify scale zero-tare",
                    is_mandatory=True,
                    order=2,
                ),
                TemplateItem(
                    id="item-c-open-3",
                    title="Receipt Paper Stock Check",
                    description="Verify thermal paper roll is loaded and backup roll is under counter",
                    is_mandatory=True,
                    order=3,
                ),
                TemplateItem(
                    id="item-c-open-4",
                    title="Counter Cleanliness & Sanitation",
                    description="Wipe checkout counter, keyboard, and barcode glass",
                    is_mandatory=False,
                    order=4,
                ),
                TemplateItem(
                    id="item-c-open-5",
                    title="eSewa & Fonepay QR Stand Check",
                    description="Ensure store QR payment stands are visible and clean",
                    is_mandatory=True,
                    order=5,
                ),
            ],
            created_by="system",
            created_by_name="System Default",
        ),
        ChecklistTemplate(
            title="Cashier Evening Register Closing",
            description="End-of-shift cash segregation and counter tidy",
            category=ChecklistCategory.closing,
            target_role=TargetRole.cashier,
            items=[
                TemplateItem(
                    id="item-c-close-1",
                    title="Clear Customer Return Baskets",
                    description="Return all abandoned items from checkout counter to respective aisles",
                    is_mandatory=True,
                    order=1,
                ),
                TemplateItem(
                    id="item-c-close-2",
                    title="Collect Loose Shopping Baskets",
                    description="Stack customer baskets neatly at entrance",
                    is_mandatory=False,
                    order=2,
                ),
                TemplateItem(
                    id="item-c-close-3",
                    title="Register Drawer Cash Bundling",
                    description="Bundle Rs. 1000 and Rs. 500 notes for safe handover",
                    is_mandatory=True,
                    order=3,
                ),
                TemplateItem(
                    id="item-c-close-4",
                    title="Clean Register Conveyor & Area",
                    description="Wipe conveyor belt and dispose of receipt trash",
                    is_mandatory=False,
                    order=4,
                ),
                TemplateItem(
                    id="item-c-close-5",
                    title="Complete Till Handover with Shift Manager",
                    description="Final register count and handover",
                    is_mandatory=True,
                    order=5,
                ),
            ],
            created_by="system",
            created_by_name="System Default",
        ),
        ChecklistTemplate(
            title="Manager Store Opening Checklist",
            description="Store readiness, cash float distribution, and staff presence check",
            category=ChecklistCategory.opening,
            target_role=TargetRole.manager,
            items=[
                TemplateItem(
                    id="item-m-open-1",
                    title="Store Perimeter & Shutter Inspection",
                    description="Inspect locks, glass front, and shutter security",
                    is_mandatory=True,
                    order=1,
                ),
                TemplateItem(
                    id="item-m-open-2",
                    title="Morning Safe Vault Count",
                    description="Verify master safe cash balance against DayClose carryover",
                    is_mandatory=True,
                    order=2,
                    requires_numeric_input=True,
                    numeric_unit="NPR",
                ),
                TemplateItem(
                    id="item-m-open-3",
                    title="Refrigeration & Freezer Temperature Audit",
                    description="Check dairy chiller (target 2°C-4°C) and ice cream freezer (target -18°C)",
                    is_mandatory=True,
                    order=3,
                    requires_numeric_input=True,
                    numeric_unit="°C",
                ),
                TemplateItem(
                    id="item-m-open-4",
                    title="Staff Attendance Roster Check",
                    description="Verify scheduled cashiers have clocked in on time via Live Roster",
                    is_mandatory=True,
                    order=4,
                ),
                TemplateItem(
                    id="item-m-open-5",
                    title="POS & Network Online Verification",
                    description="Confirm main billing server and internet router are operational",
                    is_mandatory=True,
                    order=5,
                ),
            ],
            created_by="system",
            created_by_name="System Default",
        ),
        ChecklistTemplate(
            title="Manager Store Night Closing Checklist",
            description="End-of-day register audit, vault lockdown, and store secure",
            category=ChecklistCategory.closing,
            target_role=TargetRole.manager,
            items=[
                TemplateItem(
                    id="item-m-close-1",
                    title="Verify All Cashier Day Closes",
                    description="Check all tills are reconciled and custody entries resolved",
                    is_mandatory=True,
                    order=1,
                ),
                TemplateItem(
                    id="item-m-close-2",
                    title="Night Safe Cash Deposit",
                    description="Deposit day liquid cash into safe vault",
                    is_mandatory=True,
                    order=2,
                    requires_numeric_input=True,
                    numeric_unit="NPR",
                ),
                TemplateItem(
                    id="item-m-close-3",
                    title="Perishable Produce & Dairy Inspection",
                    description="Inspect bakery and produce; write off expired goods",
                    is_mandatory=True,
                    order=3,
                ),
                TemplateItem(
                    id="item-m-close-4",
                    title="Refrigeration Night Curtains Closed",
                    description="Pull down thermal night curtains on open display chillers",
                    is_mandatory=True,
                    order=4,
                ),
                TemplateItem(
                    id="item-m-close-5",
                    title="Lights, AC & Main Shutter Lock",
                    description="Turn off non-essential power and engage alarm",
                    is_mandatory=True,
                    order=5,
                ),
            ],
            created_by="system",
            created_by_name="System Default",
        ),
    ]

    for t in templates:
        await t.insert()
