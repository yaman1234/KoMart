"""Atlas-backed short-TTL cache for expensive dashboard / inventory aggregates."""

from __future__ import annotations

import copy
import time
from datetime import datetime, timedelta, timezone
from typing import Any

from app.models.cache_entry import CacheEntry

DASHBOARD_STATS_KEY = "dashboard:stats"
INVENTORY_STATS_KEY = "inventory:stats"

DEFAULT_TTL_SECONDS = 30
_MAX_MEM_CACHE_ENTRIES = 100
_mem_cache: dict[str, tuple[float, dict[str, Any]]] = {}


async def get_cached(key: str) -> dict[str, Any] | None:
    now_mono = time.monotonic()
    mem_hit = _mem_cache.get(key)
    if mem_hit is not None:
        mem_expires, mem_payload = mem_hit
        if mem_expires > now_mono:
            return copy.deepcopy(mem_payload)
        _mem_cache.pop(key, None)

    entry = await CacheEntry.find_one(CacheEntry.key == key)
    if not entry:
        return None
    expires = entry.expires_at
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    now_utc = datetime.now(timezone.utc)
    if expires <= now_utc:
        await entry.delete()
        return None

    remaining = max(1.0, (expires - now_utc).total_seconds())
    payload = dict(entry.payload)
    if len(_mem_cache) >= _MAX_MEM_CACHE_ENTRIES:
        _mem_cache.clear()
    _mem_cache[key] = (now_mono + remaining, copy.deepcopy(payload))
    return payload


async def set_cached(
    key: str,
    payload: dict[str, Any],
    ttl_seconds: int = DEFAULT_TTL_SECONDS,
) -> None:
    if len(_mem_cache) >= _MAX_MEM_CACHE_ENTRIES:
        _mem_cache.clear()
    _mem_cache[key] = (time.monotonic() + ttl_seconds, copy.deepcopy(payload))

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
    for key in [k for k in _mem_cache if k.startswith(prefixes)]:
        _mem_cache.pop(key, None)
    for prefix in prefixes:
        await CacheEntry.find({"key": {"$regex": f"^{prefix}"}}).delete()


async def bump_commerce_caches() -> None:
    """Invalidate dashboard + inventory stats after stock / sale writes."""
    await bump_cache("dashboard:", "inventory:stats")
