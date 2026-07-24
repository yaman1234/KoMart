"""Lean product list helpers — avoid loading heavy Mongo fields on list endpoints."""

from __future__ import annotations

from typing import Any

from beanie.odm.utils.parsing import parse_obj

from app.models.product import Product


async def to_list_lean(
    query: Any,
    *,
    skip: int,
    limit: int,
    include_images: bool = True,
) -> list[Product]:
    """Load products for list endpoints without long text / full galleries.

    When include_images is True, Mongo returns only the first image ($slice).
    When False, images are omitted entirely (PO catalog / export).
    """
    filter_query = query.get_filter_query()
    pipeline: list[dict[str, Any]] = []
    if filter_query:
        pipeline.append({"$match": filter_query})

    sort_expressions = getattr(query, "sort_expressions", None) or []
    if sort_expressions:
        pipeline.append({"$sort": {field: direction for field, direction in sort_expressions}})

    if skip:
        pipeline.append({"$skip": skip})
    pipeline.append({"$limit": limit})

    project_exclude: dict[str, int] = {
        "description": 0,
        "nutrition_info": 0,
        "allergen_info": 0,
    }
    if not include_images:
        project_exclude["images"] = 0
    pipeline.append({"$project": project_exclude})

    if include_images:
        pipeline.append({"$addFields": {"images": {"$slice": ["$images", 1]}}})

    raw = await Product.aggregate(pipeline).to_list()
    products: list[Product] = []
    for doc in raw:
        doc.setdefault("images", [])
        doc.setdefault("description", "")
        doc.setdefault("nutrition_info", "")
        doc.setdefault("allergen_info", "")
        products.append(parse_obj(Product, doc))  # type: ignore[arg-type]
    return products
