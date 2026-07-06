"""Tests for Excel product update script."""

import pytest
from pathlib import Path

from app.database import init_db
from app.models.product import Product
from scripts.update_products_from_excel import _find_product, update_from_excel


@pytest.fixture(autouse=True)
async def setup_db():
    await init_db()


@pytest.mark.asyncio
async def test_find_product_by_sku():
    product = Product(
        name="Excel Update Test",
        sku="XL-UPD-001",
        barcode="XL-UPD-001",
        brand="Test",
        country_of_origin="Nepal",
        category="Snacks",
        supplier_id="sup-1",
        supplier_name="Supplier",
        cost_price=10.0,
        selling_price=15.0,
        stock=5,
        low_stock_threshold=1,
        is_active=True,
    )
    await product.insert()

    found = await _find_product(sku="XL-UPD-001", name="Other", match_by="sku")
    assert found is not None
    assert found.sku == "XL-UPD-001"

    await product.delete()


@pytest.mark.asyncio
async def test_update_requires_confirm():
    with pytest.raises(SystemExit):
        await update_from_excel(Path("nonexistent.xlsx"), dry_run=False, confirm=False)
