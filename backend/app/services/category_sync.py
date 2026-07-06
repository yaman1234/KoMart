"""Category FK helpers — category_id is canonical; category string is denormalized for display."""

from __future__ import annotations

from fastapi import HTTPException, status

from app.models.category import Category
from app.models.product import Product


async def resolve_category_fields(
    *,
    category_id: str | None = None,
    category: str | None = None,
) -> tuple[str, str]:
    """Return (category_id, category_name) for product create/update."""
    if category_id:
        cat = await Category.get(category_id)
        if not cat or not cat.is_active:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Category not found")
        return str(cat.id), cat.name
    if category and category.strip():
        name = category.strip()
        cat = await Category.find_one(Category.name == name)
        if cat:
            return str(cat.id), cat.name
        return "", name
    return "", ""


async def propagate_category_rename(category_id: str, new_name: str) -> int:
    col = Product.get_motor_collection()
    result = await col.update_many(
        {"category_id": category_id},
        {"$set": {"category": new_name}},
    )
    return int(result.modified_count)
