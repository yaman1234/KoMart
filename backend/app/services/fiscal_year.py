"""Fiscal year window helpers from store settings."""

from __future__ import annotations

from datetime import date, datetime, timezone

from app.models.settings import StoreSettings
from app.services.time_nepal import npt_day_end_utc, npt_day_start_utc, today_npt


def current_fiscal_year_start(
    settings: StoreSettings,
    today: date | None = None,
) -> date:
    """Return the AD start date of the fiscal year containing `today` (NPT)."""
    today = today or today_npt()
    month = int(getattr(settings, "fiscal_year_start_month", 7) or 7)
    day = int(getattr(settings, "fiscal_year_start_day", 16) or 16)
    # Clamp day for short months
    try:
        fy_this_year = date(today.year, month, day)
    except ValueError:
        # e.g. Feb 30 → last day of month
        if month == 12:
            fy_this_year = date(today.year, 12, 31)
        else:
            fy_this_year = date(today.year, month + 1, 1).replace(day=1)
            from datetime import timedelta

            fy_this_year = fy_this_year - timedelta(days=1)

    if today >= fy_this_year:
        return fy_this_year
    try:
        return date(today.year - 1, month, day)
    except ValueError:
        from datetime import timedelta

        if month == 12:
            return date(today.year - 1, 12, 31)
        start = date(today.year - 1, month + 1, 1)
        return start - timedelta(days=1)


def fiscal_year_start_datetime(settings: StoreSettings, today: date | None = None) -> datetime:
    start = current_fiscal_year_start(settings, today)
    return npt_day_start_utc(start)


def month_start_date(today: date | None = None) -> date:
    today = today or today_npt()
    return date(today.year, today.month, 1)


def day_bounds(d: date) -> tuple[datetime, datetime]:
    return npt_day_start_utc(d), npt_day_end_utc(d)
