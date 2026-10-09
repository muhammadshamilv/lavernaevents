"""Short-lived, signed permission to download ONE photo through a QR link.

Before this, anyone who held an event's QR link could download every photo
of the event by trying media ids 1, 2, 3 ... Now the selfie-search response
gives each matched photo its own signed link, valid only for that photo,
that QR code, and a limited time (default 12 hours; change with
GUEST_DOWNLOAD_TTL_SECONDS in settings).
"""

from django.conf import settings
from django.core import signing

_SALT = "laverna.guest-media-download"
DEFAULT_TTL_SECONDS = 12 * 60 * 60


def make_download_token(qr_token, media_id) -> str:
    return signing.dumps(
        {"q": str(qr_token), "m": int(media_id)},
        salt=_SALT,
        compress=True,
    )


def download_token_is_valid(signed, qr_token, media_id) -> bool:
    """True only for an untampered, unexpired token issued for exactly this
    QR code and this photo."""

    if not signed:
        return False

    ttl = int(getattr(settings, "GUEST_DOWNLOAD_TTL_SECONDS", DEFAULT_TTL_SECONDS))

    try:
        payload = signing.loads(signed, salt=_SALT, max_age=ttl)
    except signing.BadSignature:  # includes SignatureExpired
        return False

    return (
        isinstance(payload, dict)
        and payload.get("q") == str(qr_token)
        and payload.get("m") == int(media_id)
    )