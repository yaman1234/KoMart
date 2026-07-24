"""Atlas-backed short-TTL cache for expensive dashboard / inventory aggregates."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from app.models.cache_entry import CacheEntry

DASHBOARD_STATS_KEY = "dashboard:stats"
INVENTORY_STATS_KEY = "inventory:stats"

DEFAULT_TTL_SECONDS = 30


async def get_cached(key: str) -> dict[str, Any] | None:
    entry = await CacheEntry.find_one(CacheEntry.key == key)
    if not entry:
        return None
    expires = entry.expires_at
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    if expires <= datetime.now(timezone.utc):
        await entry.delete()
        return None
    return dict(entry.payload)


async def set_cached(
    key: str,
    payload: dict[str, Any],
    ttl_seconds: int = DEFAULT_TTL_SECONDS,
) -> None:
    expires_at = datetime.now(timezone.utc) + timedelta(seconds=ttl_seconds)
    existing = await CacheEntry.find_one(CacheEntry.key == key)
    if existing:
        existing.payload = payload
        existing.expires_at = expires_at
        await existing.save()
        return
    await CacheEntry(key=key, payload=payload, expires_at=expires_at).insert()


async def bump_cache(*prefixes: str) -> None:
    """Delete cache keys that start with any of the given prefixes."""
    if not prefixes:
        return
    for prefix in prefixes:
        await CacheEntry.find({"key": {"$regex": f"^{prefix}"}}).delete()


async def bump_commerce_caches() -> None:
    """Invalidate dashboard + inventory stats after stock / sale writes."""
    await bump_cache("dashboard:", "inventory:stats")
