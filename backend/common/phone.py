# backend/common/phone.py
"""Phone-number helpers shared by every app.

One place decides how a typed mobile number becomes a stored number, a
number for SMS / calls, and a number for wa.me links, so the "numbers that
start with 91" mistake (9188560170 treated as already having +91) cannot
come back in one app while it is fixed in another.
"""

import re

from decouple import config


def default_country_code() -> str:
    return config("DEFAULT_COUNTRY_CODE", default="91")


def clean_phone_text(raw) -> str:
    """Remove spaces, dashes and brackets, keep digits and a leading +."""

    return re.sub(r"[\s\-()]", "", str(raw or "").strip())


def normalize_phone_digits(raw) -> str:
    """Digits WITH country code, e.g. "9188560170" -> "919188560170".

    A number typed with a leading + or 00 already carries its country
    code. Otherwise it is national: a leading 0 is dropped and the default
    country code is added, unless it is already longer than 10 digits and
    starts with that code.
    """

    text = clean_phone_text(raw)
    digits = re.sub(r"\D", "", text)

    if text.startswith("+"):
        return digits

    if digits.startswith("00"):
        return digits[2:]

    digits = digits.lstrip("0")
    country_code = default_country_code()

    if len(digits) > 10 and digits.startswith(country_code):
        return digits

    return f"{country_code}{digits}"


def stored_number_to_digits(raw) -> str:
    """Digits WITH country code for a number as STORED on a Guest.

    Stored guest numbers are the plain 10-digit national number (e.g.
    "9876543210") or, for a foreign number, its full international digits
    (e.g. "447911123456", saved without a "+"). So here - unlike
    normalize_phone_digits - anything longer than 10 digits is treated as
    already carrying its country code, which keeps foreign numbers from
    getting the default code put in front of them. Older records saved with
    a 91 prefix ("919876543210") also come out right.
    """

    text = clean_phone_text(raw)
    digits = re.sub(r"\D", "", text)

    if text.startswith("+"):
        return digits

    if digits.startswith("00"):
        return digits[2:]

    digits = digits.lstrip("0")

    if len(digits) <= 10:
        return f"{default_country_code()}{digits}"

    return digits


def canonical_mobile(raw) -> str:
    """The form stored on the User: the plain 10-digit number for the
    default country, otherwise the full international digits.

    So "9188560170", "+91 91885 60170" and "919188560170" are all the
    same account.
    """

    digits = normalize_phone_digits(raw)
    country_code = default_country_code()

    if digits.startswith(country_code) and len(digits) == len(country_code) + 10:
        return digits[len(country_code):]

    return digits


def to_e164(raw) -> str:
    return f"+{normalize_phone_digits(raw)}"


def is_default_country_number(raw) -> bool:
    digits = normalize_phone_digits(raw)
    country_code = default_country_code()

    return digits.startswith(country_code) and len(digits) == len(country_code) + 10