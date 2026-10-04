"""Bundle (combo) product helpers.

A bundle is a real :class:`~app.models.product.Product` that is sold as a single
POS line but is *made from* other products. It holds no stock of its own:

* **Availability** is derived — ``min(floor(component_stock / component_qty))``.
* **Cost** is derived from the batches actually deducted at sale time.
* **Deduction** expands into per-component FEFO deductions on the components.

Bundles may not contain other bundles. That keeps derivation one level deep and
therefore cheap and deterministic on every product list render, and it stops a
bad edit from creating a cycle that would hang stock calculation.
"""

from __future__ import annotations

from app.models.product import BundleComponent, Product
from app.services.stock import get_current_stock_batch

# Guard against pathological definitions; a normal bundle has 2-5 components.
MAX_BUNDLE_COMPONENTS = 20

# Mongo filter matching "not a bundle". $ne (rather than == False) also matches
# legacy documents written before is_bundle existed.
NON_BUNDLE_FILTER: dict = {"is_bundle": {"$ne": True}}


def is_bundle(product: Product) -> bool:
    return bool(getattr(product, "is_bundle", False))


def get_components(product: Product) -> list[BundleComponent]:
    if not is_bundle(product):
        return []
    return list(getattr(product, "bundle_components", None) or [])


def component_ids(products: list[Product]) -> set[str]:
    """Every component product id referenced by the given bundles."""
    ids: set[str] = set()
    for product in products:
        for component in get_components(product):
            ids.add(component.product_id)
    return ids


def expand_bundle(product: Product, bundle_quantity: int) -> list[tuple[str, int]]:
    """Component deductions required to sell ``bundle_quantity`` of a bundle.

    Returns ``(component_product_id, quantity)`` pairs in component base units.
    Duplicate component ids are merged so a component is deducted in one pass.
    """
    merged: dict[str, int] = {}
    for component in get_components(product):
        quantity = int(getattr(component, "quantity", 1) or 1)
        if quantity < 1:
            continue
        merged[component.product_id] = merged.get(component.product_id, 0) + quantity * bundle_quantity
    return list(merged.items())


def bundle_available(components: list[BundleComponent], stock_map: dict[str, int]) -> int:
    """How many bundles can be built from current stock. 0 when any part is short."""
    if not components:
        return 0
    available: int | None = None
    for component in components:
        quantity = int(getattr(component, "quantity", 1) or 1)
        if quantity < 1:
            return 0
        have = stock_map.get(component.product_id, 0)
        possible = have // quantity
        available = possible if available is None else min(available, possible)
        if available <= 0:
            return 0
    return max(0, available)


def resolve_stock_map(products: list[Product], stock_map: dict[str, int]) -> dict[str, int]:
    """Overlay derived stock for bundles onto a base component/product stock map.

    ``stock_map`` must already contain stock for every product in ``products``
    *and* for every bundle component (see :func:`component_ids`).
    """
    resolved = dict(stock_map)
    for product in products:
        if is_bundle(product):
            resolved[str(product.id)] = bundle_available(get_components(product), stock_map)
    return resolved


def bundle_cost(components: list[BundleComponent], product_map: dict[str, Product]) -> float:
    """Indicative cost of one bundle from component ``cost_price`` values.

    Used for display only. The authoritative cost recorded on a sale comes from
    the batches actually deducted (FEFO), so this can differ from the real cost.
    """
    total = 0.0
    for component in components:
        child = product_map.get(component.product_id)
        if not child:
            continue
        quantity = int(getattr(component, "quantity", 1) or 1)
        total += float(getattr(child, "cost_price", 0.0) or 0.0) * quantity
    return round(total, 2)


def build_bundle_description(
    components: list[BundleComponent],
    name_map: dict[str, str],
) -> str:
    """Auto-generate the bundle's product description from its components."""
    if not components:
        return ""
    parts: list[str] = []
    for component in components:
        name = name_map.get(component.product_id)
        if not name:
            continue
        quantity = int(getattr(component, "quantity", 1) or 1)
        parts.append(f"{quantity} x {name}")
    if not parts:
        return ""
    return "Combo pack containing: " + ", ".join(parts)


async def stock_map_for(products: list[Product]) -> dict[str, int]:
    """Stock for a page of products in ONE batch query, bundles derived.

    Replaces the plain ``get_current_stock_batch`` call on list endpoints so a
    bundle reports how many packs its components can currently build instead of
    its (always empty) own stock.
    """
    ids = {str(p.id) for p in products}
    ids |= component_ids(products)
    base = await get_current_stock_batch(list(ids)) if ids else {}
    return resolve_stock_map(products, base)


async def derived_stock_for(product: Product) -> int:
    """Derived stock for a single product (bundles resolved from components)."""
    if not is_bundle(product):
        from app.services.stock import get_current_stock

        return await get_current_stock(str(product.id))
    components = get_components(product)
    if not components:
        return 0
    base = await get_current_stock_batch([c.product_id for c in components])
    return bundle_available(components, base)
