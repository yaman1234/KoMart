from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

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
    notifications,
    settings as settings_router,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    await refresh_all_product_stocks()
    yield


app = FastAPI(
    title="KoMart API",
    description="Backend API for KoMart — Korean & Asian Snacks Retail Management",
    version="1.0.0",
    lifespan=lifespan,
)

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
app.include_router(notifications.router, prefix=API_PREFIX)
app.include_router(settings_router.router, prefix=API_PREFIX)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "komart-api"}
