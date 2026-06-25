from pydantic import BaseModel


class DashboardStats(BaseModel):
    today_sales: float
    weekly_sales: float
    monthly_sales: float
    total_products: int
    low_stock_products: int
    expiring_products: int
    inventory_value: float
    customer_count: int


class RevenueDataPoint(BaseModel):
    date: str
    revenue: float


class TopProduct(BaseModel):
    product_id: str
    name: str
    quantity_sold: int
    revenue: float


class SalesByCategory(BaseModel):
    category: str
    revenue: float
    count: int
