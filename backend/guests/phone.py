"""Guest mobile-number helpers (built on common/phone.py)."""

import re

from common.phone import canonical_mobile, default_country_code

INVALID_MOBILE_MESSAGE = "Enter a valid mobile number (10-15 digits)."


def normalize_guest_mobile(raw) -> str:
    """Turn whatever was typed into the one stored form.

    * "+91 98765 43210", "098765 43210", "919876543210" and "9876543210" all
      become "9876543210" (the same guest, so duplicates are caught).
    * A number typed with another country's "+" code keeps its digits,
      e.g. "+44 7911 123456" -> "447911123456".
    Returns "" when nothing usable was given.
    """

    text = re.sub(r"[\s\-().]", "", str(raw or "").strip())
    digits = re.sub(r"\D", "", text)

    if not digits:
        return ""

    if text.startswith("+") or digits.startswith("00"):
        return canonical_mobile(text)

    digits = digits.lstrip("0")
    country_code = default_country_code()

    if len(digits) == len(country_code) + 10 and digits.startswith(country_code):
        return digits[len(country_code):]

    return digits


def is_valid_guest_mobile(value: str) -> bool:
    return value.isdigit() and 10 <= len(value) <= 15