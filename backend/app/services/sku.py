"""SKU generation with database uniqueness checks."""

from __future__ import annotations

import random
import secrets

from app.models.product import Product


def build_sku(brand: str, category: str) -> str:
    """Build a human-readable SKU from brand and category initials."""
    brand_part = (brand or "PRD").replace(" ", "").upper()[:3] or "PRD"
    category_words = (category or "GEN").replace("&", " ").split()
    category_part = "".join(word[0] for word in category_words if word).upper()[:3] or "GEN"
    suffix = str(random.randint(1000, 9999))
    return f"{brand_part}-{category_part}-{suffix}"


async def generate_unique_sku(
    brand: str,
    category: str,
    *,
    exclude: set[str] | None = None,
    max_attempts: int = 25,
) -> str:
    """Return a SKU that is unique in the database and not in exclude."""
    exclude_lower = {value.lower() for value in (exclude or set()) if value}

    for _ in range(max_attempts):
        candidate = build_sku(brand, category)
        key = candidate.lower()
        if key in exclude_lower:
            continue
        if await Product.find_one(Product.sku == candidate):
            continue
        return candidate

    # Extremely unlikely fallback — longer random suffix.
    for _ in range(max_attempts):
        brand_part = (brand or "PRD").replace(" ", "").upper()[:3] or "PRD"
        category_words = (category or "GEN").replace("&", " ").split()
        category_part = "".join(word[0] for word in category_words if word).upper()[:3] or "GEN"
        candidate = f"{brand_part}-{category_part}-{secrets.token_hex(3).upper()}"
        key = candidate.lower()
        if key in exclude_lower:
            continue
        if await Product.find_one(Product.sku == candidate):
            continue
        return candidate

    raise RuntimeError("Could not generate a unique SKU")
