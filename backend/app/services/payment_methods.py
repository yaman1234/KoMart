"""Payment method helpers — normalize legacy card → bank."""

from __future__ import annotations


def normalize_payment_method(method: str | None) -> str:
    value = (method or "").strip().lower()
    if value == "card":
        return "bank"
    return value
