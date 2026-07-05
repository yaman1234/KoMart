#!/usr/bin/env python3
"""
Import products from an Excel workbook into the KoMart MongoDB database.

Expected columns (header row, case-insensitive):
  S.No., SKU, Product Name, Quantity, UOM, Rate, Amount, Sales Price,
  Barcode, Brand, Country Of Origin, Category, Expiry Date(mm/dd/yyyy),
  ImageURL, Supplier, Additional Info

Usage (from backend/):
  python scripts/import_products_from_excel.py "../product list.xlsx"
  python scripts/import_products_from_excel.py "../product list.xlsx" --dry-run
  python scripts/import_products_from_excel.py "../product list.xlsx" --markup 1.19

Idempotent: skips products whose name already exists (case-insensitive).
"""
from __future__ import annotations

import argparse
import asyncio
import re
import sys
from datetime import date, datetime
from pathlib import Path

# Allow imports from backend/app
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import openpyxl  # noqa: E402

from app.database import init_db  # noqa: E402
from app.models.category import Category  # noqa: E402
from app.models.product import Product, SellMode  # noqa: E402
from app.models.supplier import Supplier  # noqa: E402
from app.services.stock import receive_stock, refresh_all_product_stocks  # noqa: E402

DEFAULT_MARKUP = 1.194  # avg selling_price / rate from sample rows with both values
DEFAULT_CATEGORY = "General"
DEFAULT_UOM = "pcs"

UOM_ALIASES: dict[str, str] = {
    "pcs": "pcs",
    "pc": "pcs",
    "piece": "pcs",
    "pieces": "pcs",
    "pkt": "pack",
    "pack": "pack",
    "box": "box",
    "bag": "bag",
    "btl": "bottle",
    "bottle": "bottle",
    "can": "can",
    "jar": "can",
    "kg": "kg",
    "g": "g",
    "l": "L",
    "ml": "ml",
    "dz": "dozen",
    "dozen": "dozen",
}

COUNTRY_ALIASES: dict[str, str] = {
    "korea": "South Korea",
    "south korea": "South Korea",
    "china": "China",
    "thailand": "Thailand",
    "nepal": "Nepal",
    "india": "India",
    "japan": "Japan",
    "malaysia": "Malaysia",
}

# Map normalized header → internal field key
HEADER_MAP: dict[str, str] = {
    "s.no.": "serial",
    "sno": "serial",
    "sku": "sku",
    "product name": "name",
    "name": "name",
    "quantity": "quantity",
    "qty": "quantity",
    "uom": "uom",
    "rate": "cost_price",
    "cost": "cost_price",
    "cost price": "cost_price",
    "amount": "amount",
    "sales price": "selling_price",
    "selling price": "selling_price",
    "sell price": "selling_price",
    "barcode": "barcode",
    "brand": "brand",
    "country of origin": "country",
    "country": "country",
    "category": "category",
    "expiry date(mm/dd/yyyy)": "expiry",
    "expiry date": "expiry",
    "expiry": "expiry",
    "imageurl": "image_url",
    "image url": "image_url",
    "image": "image_url",
    "supplier": "supplier",
    "additional info": "description",
    "description": "description",
}


def _normalize_header(value: object) -> str:
    return re.sub(r"\s+", " ", str(value or "").strip().lower())


def _as_float(value: object) -> float | None:
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _as_int(value: object) -> int | None:
    f = _as_float(value)
    if f is None:
        return None
    return int(f)


def _normalize_uom(raw: str | None) -> str:
    if not raw:
        return DEFAULT_UOM
    key = raw.strip().lower()
    return UOM_ALIASES.get(key, key)


def _normalize_country(raw: str | None) -> str:
    if not raw:
        return ""
    key = raw.strip().lower()
    return COUNTRY_ALIASES.get(key, raw.strip().title())


def _normalize_category(raw: str | None) -> str:
    if not raw or not str(raw).strip():
        return DEFAULT_CATEGORY
    text = str(raw).strip()
    return text[0].upper() + text[1:] if len(text) == 1 else text.title()


def _format_expiry(value: object) -> str | None:
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        return value.date().isoformat()
    if isinstance(value, date):
        return value.isoformat()
    text = str(value).strip()
    for fmt in ("%m/%d/%Y", "%Y-%m-%d", "%d/%m/%Y"):
        try:
            return datetime.strptime(text, fmt).date().isoformat()
        except ValueError:
            continue
    return None


def _placeholder_image(name: str) -> str:
    slug = name.replace(" ", "+")[:30]
    return f"https://placehold.co/400x400/FF6B35/FFFFFF?text={slug}"


def _auto_sku(serial: int | None, index: int) -> str:
    n = serial if serial is not None else index
    return f"XL-{int(n):04d}"


def _parse_workbook(path: Path) -> list[dict]:
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    ws = wb.active
    rows = list(ws.iter_rows(values_only=True))
    wb.close()

    if not rows:
        raise ValueError("Workbook is empty.")

    headers = [_normalize_header(h) for h in rows[0]]
    col_keys: list[str | None] = []
    for h in headers:
        col_keys.append(HEADER_MAP.get(h))

    records: list[dict] = []
    for row_index, row in enumerate(rows[1:], start=2):
        if not row or all(cell is None or str(cell).strip() == "" for cell in row):
            continue

        record: dict = {}
        for col_index, key in enumerate(col_keys):
            if key and col_index < len(row):
                record[key] = row[col_index]

        name = str(record.get("name") or "").strip()
        if not name:
            continue

        record["name"] = name
        record["_row"] = row_index
        records.append(record)

    return records


async def _get_or_create_category(name: str) -> None:
    if await Category.find_one(Category.name == name):
        return
    await Category(name=name, description="").insert()


async def _get_or_create_supplier(name: str, cache: dict[str, Supplier]) -> Supplier | None:
    name = name.strip()
    if not name:
        return None
    if name in cache:
        return cache[name]
    existing = await Supplier.find_one(Supplier.name == name)
    if existing:
        cache[name] = existing
        return existing
    supplier = await Supplier(
        name=name,
        country="Nepal",
        contact_person="—",
        phone="—",
        email=None,
        address="—",
    ).insert()
    cache[name] = supplier
    return supplier


async def import_from_excel(
    file_path: Path,
    *,
    dry_run: bool = False,
    markup: float = DEFAULT_MARKUP,
    created_by: str = "Excel Import",
) -> None:
    records = _parse_workbook(file_path)
    print(f"Parsed {len(records)} product row(s) from {file_path.name}")

    await init_db()
    print("Connected to MongoDB.")
    if dry_run:
        print("DRY RUN — no writes will be performed.\n")

    supplier_cache: dict[str, Supplier] = {}
    created = skipped = errors = 0
    stock_units = 0
    inferred_prices = 0

    for index, rec in enumerate(records, start=1):
        name = rec["name"]
        name_key = name.lower()

        existing = await Product.find_one({"name": {"$regex": f"^{re.escape(name)}$", "$options": "i"}})
        if existing:
            print(f"  SKIP  row {rec['_row']:>3} | {name} — already exists")
            skipped += 1
            continue

        serial = _as_int(rec.get("serial"))
        sku = str(rec.get("sku") or "").strip() or _auto_sku(serial, index)
        if await Product.find_one(Product.sku == sku):
            sku = f"{sku}-{index:02d}"

        cost_price = _as_float(rec.get("cost_price")) or 0.0
        selling_price = _as_float(rec.get("selling_price"))
        if selling_price is None and cost_price > 0:
            selling_price = round(cost_price * markup, 2)
            inferred_prices += 1
        elif selling_price is None:
            selling_price = 0.0

        quantity = _as_int(rec.get("quantity")) or 0
        uom = _normalize_uom(rec.get("uom"))
        category = _normalize_category(rec.get("category"))
        brand = str(rec.get("brand") or "").strip()
        country = _normalize_country(rec.get("country"))
        barcode = str(rec.get("barcode") or "").strip()
        description = str(rec.get("description") or "").strip()
        image_url = str(rec.get("image_url") or "").strip()
        expiry = _format_expiry(rec.get("expiry"))
        supplier_name = str(rec.get("supplier") or "").strip()

        price_note = f" (sell inferred @ {markup:.0%} markup)" if (
            _as_float(rec.get("selling_price")) is None and cost_price > 0
        ) else ""

        if dry_run:
            print(
                f"  WOULD CREATE row {rec['_row']:>3} | {sku} | {name} | "
                f"{category} | cost {cost_price} | sell {selling_price}{price_note} | "
                f"qty {quantity} | {uom}"
            )
            created += 1
            stock_units += max(0, quantity)
            continue

        try:
            await _get_or_create_category(category)
            supplier = await _get_or_create_supplier(supplier_name, supplier_cache)

            threshold = 10 if quantity >= 10 else max(1, quantity // 2 or 1)
            images = [image_url] if image_url else [_placeholder_image(name)]

            product = await Product(
                name=name,
                sku=sku,
                barcode=barcode,
                brand=brand,
                country_of_origin=country,
                category=category,
                supplier_id=str(supplier.id) if supplier else "",
                supplier_name=supplier.name if supplier else "",
                description=description,
                buy_uom=uom,
                uom=uom,
                units_per_buy_uom=1,
                sell_mode=SellMode.unit,
                cost_price=cost_price,
                selling_price=selling_price,
                images=images,
                stock=0,
                low_stock_threshold=threshold,
            ).insert()

            if quantity > 0:
                await receive_stock(
                    str(product.id),
                    f"XL-INIT-{sku}",
                    quantity,
                    expiry_date=expiry,
                    unit_cost=cost_price,
                    unit_selling_price=selling_price,
                    created_by=created_by,
                )
                stock_units += quantity

            print(f"  ADD   row {rec['_row']:>3} | {sku} | {name} | qty {quantity}{price_note}")
            created += 1
        except Exception as exc:
            print(f"  ERROR row {rec['_row']:>3} | {name} — {exc}")
            errors += 1

    if not dry_run:
        await refresh_all_product_stocks()

    print()
    print("Import complete!")
    print(f"  Created          : {created}")
    print(f"  Skipped (exists) : {skipped}")
    print(f"  Errors           : {errors}")
    print(f"  Stock units      : {stock_units}")
    print(f"  Inferred prices  : {inferred_prices}")
    print(f"  Suppliers touched: {len(supplier_cache)}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Import KoMart products from Excel")
    parser.add_argument(
        "file",
        type=Path,
        help='Path to Excel file (e.g. "../product list.xlsx")',
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Preview import without writing to the database",
    )
    parser.add_argument(
        "--markup",
        type=float,
        default=DEFAULT_MARKUP,
        help=f"Markup multiplier when Sales Price is blank (default: {DEFAULT_MARKUP})",
    )
    args = parser.parse_args()

    if not args.file.exists():
        parser.error(f"File not found: {args.file}")

    asyncio.run(
        import_from_excel(
            args.file.resolve(),
            dry_run=args.dry_run,
            markup=args.markup,
        )
    )


if __name__ == "__main__":
    main()
