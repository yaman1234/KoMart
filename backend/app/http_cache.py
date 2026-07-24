"""HTTP cache helpers for public (unauthenticated) responses."""

from __future__ import annotations

from fastapi import Response


def set_public_cache(
    response: Response,
    *,
    max_age: int,
    s_maxage: int | None = None,
) -> None:
    """Set Cache-Control for CDN/browser caching of public GETs."""
    parts = ["public", f"max-age={max_age}"]
    if s_maxage is not None:
        parts.append(f"s-maxage={s_maxage}")
    response.headers["Cache-Control"] = ", ".join(parts)
