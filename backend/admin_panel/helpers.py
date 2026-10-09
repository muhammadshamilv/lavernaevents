"""Small pure helpers for the admin panel (no database access, so they are
easy to test)."""

import re
from datetime import date, timedelta
from decimal import Decimal

from common.phone import canonical_mobile, clean_phone_text


def normalize_admin_mobile(value) -> str:
    """The one stored form of a mobile number (same rule as registration):
    9188560170, +91 91885 60170 and 919188560170 are the same account.

    Raises ValueError with a message fit to show the admin.
    """

    cleaned = clean_phone_text(value)

    if not cleaned:
        raise ValueError("Mobile number is required.")

    if not re.fullmatch(r"\+?\d+", cleaned):
        raise ValueError("Mobile number must contain only digits (a leading + is allowed).")

    mobile = canonical_mobile(cleaned)

    if not 10 <= len(mobile) <= 15:
        raise ValueError("Mobile number must contain between 10 and 15 digits.")

    return mobile


def last_n_days(end: date, days: int) -> list[date]:
    """`days` consecutive dates, oldest first, ending on `end`."""

    return [end - timedelta(days=days - 1 - offset) for offset in range(days)]


def fill_daily_series(values: dict, end: date, days: int, zero=0) -> list[dict]:
    """A reading for EVERY one of the last `days` days (0 where nothing
    happened), so a chart is a true timeline instead of only the busy days.

    `values` maps date -> number. Returns [{"period": "2026-10-08", "value": n}].
    """

    return [{"period": day.isoformat(), "value": values.get(day, zero)} for day in last_n_days(end, days)]


ZERO_MONEY = Decimal("0.00")
