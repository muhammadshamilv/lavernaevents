"""Rate limiting for LavernaEvents.

One throttle class, ``RouteThrottle``, is installed globally in
settings.REST_FRAMEWORK. It works out which rules apply to the view being
called, so no view file needs editing:

* a view may declare ``throttle_rules = (("scope", "kind"), ...)``; otherwise
  the table VIEW_RULES below (keyed by the view's class name) is used;
* every request is ALSO counted against a generous catch-all
  ("user" for signed-in people, "anon" per IP for everyone else);
* webhook views (signature-checked, called by Stripe/Twilio servers) are
  exempt, because many requests legitimately come from a few shared IPs.

``kind`` is what the counter is keyed on:
    "ip"    - the visitor's IP address
    "user"  - the signed-in user's id (falls back to IP when anonymous)
    "ident" - the mobile number in the request body, so an attacker cannot
              spread guesses for ONE account over many IP addresses

Rates (e.g. "10/min", "10/10min", "5/hour") live in
settings.REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"].
"""

import hashlib
import hmac
import ipaddress
import logging
import re
import time

from django.conf import settings
from django.core.cache import cache
from rest_framework.throttling import BaseThrottle

logger = logging.getLogger(__name__)

# --------------------------------------------------------------------
# Which view gets which rules
# --------------------------------------------------------------------

VIEW_RULES = {
    # Accounts
    "UserLoginView": (("login", "ip"), ("login_ident", "ident")),
    "UserRegistrationView": (("register", "ip"),),
    "VerifyMobileView": (("otp", "ip"), ("otp_ident", "ident")),
    "ResendOTPView": (("otp", "ip"), ("otp_ident", "ident")),
    "ForgotPasswordView": (("password_reset", "ip"), ("password_reset_ident", "ident")),
    "ResetPasswordView": (("password_reset", "ip"), ("password_reset_ident", "ident")),
    "UserTokenRefreshView": (("refresh", "ip"),),
    # Public guest pages
    "InvitationResponsePageView": (("guest_public", "ip"),),
    "InvitationCalendarView": (("guest_public", "ip"),),
    "ScannedEventView": (("guest_public", "ip"),),
    "GuestSelfieMatchView": (("selfie", "ip"), ("selfie_hour", "ip")),
    "GuestMediaDownloadView": (("download", "ip"),),
    # Organiser actions that cost money, CPU or storage
    "CustomTemplateUploadView": (("upload", "user"),),
    "EventGalleryView": (("upload", "user"),),
    "SendInvitationView": (("send", "user"),),
    "SendBulkInvitationsView": (("send", "user"),),
    "SendReminderView": (("send", "user"),),
    "SendPendingWhatsAppReminderView": (("send", "user"),),
}

# Called by Stripe / Twilio servers; protected by signature checks instead.
EXEMPT_VIEWS = frozenset(
    {"StripeWebhookView", "VoiceTwiMLView", "TwilioCallStatusCallbackView"}
)

# Methods that never change anything are not counted against "send"/"upload"
# style rules (listing a gallery is not an upload).
SAFE_METHODS = frozenset({"GET", "HEAD", "OPTIONS"})
WRITE_ONLY_SCOPES = frozenset({"upload", "send"})


# --------------------------------------------------------------------
# Real client IP
# --------------------------------------------------------------------


def _valid_ip(value):
    try:
        return str(ipaddress.ip_address((value or "").strip()))
    except ValueError:
        return None


def get_client_ip(request) -> str:
    """The visitor's IP, not a proxy's.

    1. Pages Function sent X-Client-IP + a matching X-Proxy-Secret -> trust it.
    2. Otherwise, with TRUSTED_PROXY_COUNT = n, take the n-th address from
       the right of X-Forwarded-For (the part our own proxies appended; the
       left side is client-controlled and can be forged).
    3. Otherwise the socket address.
    """

    meta = request.META

    secret = getattr(settings, "PROXY_SHARED_SECRET", "")
    if secret:
        provided = meta.get("HTTP_X_PROXY_SECRET", "")
        if provided and hmac.compare_digest(provided.encode(), secret.encode()):
            ip = _valid_ip(meta.get("HTTP_X_CLIENT_IP", ""))
            if ip:
                return ip

    hops = int(getattr(settings, "TRUSTED_PROXY_COUNT", 0) or 0)
    if hops > 0:
        parts = [p.strip() for p in meta.get("HTTP_X_FORWARDED_FOR", "").split(",") if p.strip()]
        if len(parts) >= hops:
            ip = _valid_ip(parts[-hops])
            if ip:
                return ip

    return _valid_ip(meta.get("REMOTE_ADDR", "")) or "unknown"


# --------------------------------------------------------------------
# Throttle
# --------------------------------------------------------------------

_RATE_RE = re.compile(r"^\s*(\d+)\s*/\s*(\d*)\s*(s|sec|second|m|min|minute|h|hour|d|day)s?\s*$", re.I)
_UNIT_SECONDS = {"s": 1, "m": 60, "h": 3600, "d": 86400}


def parse_rate(rate):
    """'10/min' -> (10, 60); '10/10min' -> (10, 600). None if unparsable."""

    match = _RATE_RE.match(rate or "")
    if not match:
        return None
    count, multiplier, unit = match.groups()
    return int(count), int(multiplier or 1) * _UNIT_SECONDS[unit[0].lower()]


def _mobile_ident(request):
    """The account named in the body (mobile number, or the email typed on
    the forgot / reset password forms), hashed. None if absent."""

    try:
        data = request.data
        raw = (
            data.get("mobile_number")
            or data.get("mobile")
            or data.get("identifier")
            or data.get("email")
            or ""
        )
    except Exception:  # unparsable body: the view will answer 400 itself
        return None

    if "@" in str(raw):
        return hashlib.sha256(str(raw).strip().lower().encode()).hexdigest()[:24]

    digits = re.sub(r"\D", "", str(raw))
    # Compare the last 10 digits so "+91 98765 43210" and "9876543210" match.
    digits = digits[-10:]
    if not digits:
        return None
    return hashlib.sha256(digits.encode()).hexdigest()[:24]


class RouteThrottle(BaseThrottle):
    """See the module docstring."""

    def __init__(self):
        self._wait = None

    def _rules_for(self, view):
        rules = getattr(view, "throttle_rules", None)
        if rules is None:
            rules = VIEW_RULES.get(type(view).__name__, ())
        return rules

    def _hit(self, key, rate):
        """Count one request; return seconds to wait if over the limit."""

        parsed = parse_rate(rate)
        if parsed is None:
            logger.warning("Unusable throttle rate %r for %s", rate, key)
            return None

        limit, window = parsed
        now = time.time()
        history = [t for t in cache.get(key, []) if t > now - window]

        if len(history) >= limit:
            return max(1, int(history[0] + window - now) + 1)

        history.append(now)
        cache.set(key, history, window)
        return None

    def allow_request(self, request, view):
        if type(view).__name__ in EXEMPT_VIEWS:
            return True

        rates = settings.REST_FRAMEWORK.get("DEFAULT_THROTTLE_RATES", {})
        user = getattr(request, "user", None)
        user_id = user.pk if user is not None and user.is_authenticated else None
        ip = get_client_ip(request)

        checks = []

        for scope, kind in self._rules_for(view):
            if scope in WRITE_ONLY_SCOPES and request.method in SAFE_METHODS:
                continue

            if kind == "ident":
                if request.method in SAFE_METHODS:
                    continue
                ident = _mobile_ident(request)
                if ident is None:
                    continue
            elif kind == "user":
                ident = f"u{user_id}" if user_id else f"ip{ip}"
            else:
                ident = f"ip{ip}"

            checks.append((f"throttle:{scope}:{ident}", rates.get(scope)))

        if user_id:
            checks.append((f"throttle:user:u{user_id}", rates.get("user")))
        else:
            checks.append((f"throttle:anon:ip{ip}", rates.get("anon")))

        waits = []
        for key, rate in checks:
            wait = self._hit(key, rate)
            if wait is not None:
                waits.append(wait)

        if waits:
            self._wait = max(waits)
            return False

        return True

    def wait(self):
        return self._wait
