import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import settings
from app.database import init_db
from app.services.stock import refresh_all_product_stocks
from app.routers import (
    auth,
    products,
    inventory,
    suppliers,
    purchase_orders,
    customers,
    transactions,
    dashboard,
    reports,
    notifications,
    settings as settings_router,
    expenses,
    users,
    categories,
)

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Best-effort startup: try to connect to MongoDB.
    If it fails (e.g. slow cold-start), the middleware below retries on
    the first real request — so Vercel never crashes from a startup error.
    """
    try:
        await init_db()
        if not settings.skip_stock_refresh_on_start:
            await refresh_all_product_stocks()
        logger.info("Startup DB init succeeded.")
    except Exception as exc:
        logger.warning("Startup DB init failed — will retry on first request. %s", exc)
    yield


app = FastAPI(
    title="KoMart API",
    description="Backend API for KoMart — Korean & Asian Snacks Retail Management",
    version="1.0.0",
    lifespan=lifespan,
)


@app.middleware("http")
async def ensure_db(request: Request, call_next):
    """Lazy-init fallback: guarantees DB is ready before every request."""
    try:
        await init_db()
    except Exception as exc:
        logger.error("DB init failed on request %s: %s", request.url.path, exc)
        return JSONResponse(
            status_code=503,
            content={"detail": "Database unavailable. Please try again shortly."},
        )
    return await call_next(request)


# Added last so it wraps all responses (including 503/errors) with CORS headers
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

API_PREFIX = "/api/v1"

app.include_router(auth.router, prefix=API_PREFIX)
app.include_router(products.router, prefix=API_PREFIX)
app.include_router(inventory.router, prefix=API_PREFIX)
app.include_router(suppliers.router, prefix=API_PREFIX)
app.include_router(purchase_orders.router, prefix=API_PREFIX)
app.include_router(customers.router, prefix=API_PREFIX)
app.include_router(transactions.router, prefix=API_PREFIX)
app.include_router(dashboard.router, prefix=API_PREFIX)
app.include_router(reports.router, prefix=API_PREFIX)
app.include_router(notifications.router, prefix=API_PREFIX)
app.include_router(settings_router.router, prefix=API_PREFIX)
app.include_router(expenses.router, prefix=API_PREFIX)
app.include_router(users.router, prefix=API_PREFIX)
app.include_router(categories.router, prefix=API_PREFIX)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "komart-api"}
