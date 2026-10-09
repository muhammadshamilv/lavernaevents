# backend/users/services.py
"""OTP delivery and checking for mobile verification and password reset.

Delivery is chosen with OTP_DELIVERY, a comma-separated list of:
    console   print the code in the server terminal (development)
    email     send the code to the user's email address
    sms       send the code to the user's mobile (SMS_PROVIDER decides who)

Examples:
    OTP_DELIVERY=console              local development (default)
    OTP_DELIVERY=console,email        hosted testing
    OTP_DELIVERY=email,sms            production

Each method is tried on its own; one failing never blocks the others.
"""

import hmac
import logging
from datetime import timedelta

from decouple import config
from django.core.mail import EmailMultiAlternatives
from django.db import transaction
from django.utils import timezone
from django.utils.html import escape

from common.phone import (
    canonical_mobile,
    clean_phone_text,
    is_default_country_number,
    normalize_phone_digits,
    to_e164,
)

from .models import MobileOTP, User

logger = logging.getLogger(__name__)

RESEND_COOLDOWN_SECONDS = 60
MAX_OTPS_PER_HOUR = 5

GENERIC_BAD_CODE = "Invalid or expired code. Please request a new one."


class OTPThrottled(Exception):
    """Raised when a code was requested too soon or too often."""

    def __init__(self, wait_seconds: int, message: str):
        self.wait_seconds = wait_seconds
        self.message = message
        super().__init__(message)


# ---------------------------------------------------------------------
# Finding users
# ---------------------------------------------------------------------

def get_user_by_mobile(raw_mobile: str) -> User | None:
    """Find a user however the number was typed (9188560170, +919188560170,
    919188560170 ...). Older accounts stored in another form still match."""

    candidates = {
        clean_phone_text(raw_mobile),
        canonical_mobile(raw_mobile),
        normalize_phone_digits(raw_mobile),
    }

    candidates.discard("")

    return User.objects.filter(mobile_number__in=candidates).first()


def find_user_by_identifier(identifier: str) -> User | None:
    """An email address (contains @) or a mobile number."""

    identifier = (identifier or "").strip()

    if "@" in identifier:
        return User.objects.filter(email__iexact=identifier).first()

    return get_user_by_mobile(identifier)


# ---------------------------------------------------------------------
# Delivery
# ---------------------------------------------------------------------

def _delivery_modes() -> list[str]:
    raw = config("OTP_DELIVERY", default="console")

    return [mode.strip().lower() for mode in raw.split(",") if mode.strip()]


def _send_otp_console(user: User, message: str, subject: str, code: str) -> None:
    print(
        "\n"
        "==================== OTP ====================\n"
        f"To: {user.mobile_number} / {user.email}\n"
        f"Message: {message}\n"
        "=============================================\n"
    )


def _send_otp_email(user: User, message: str, subject: str, code: str) -> None:
    if not user.email:
        raise RuntimeError("User has no email address.")

    html = (
        '<div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;'
        'padding:24px;border:1px solid #eee;border-radius:12px">'
        '<p style="margin:0 0 8px;color:#C2185B;font-size:12px;letter-spacing:3px;'
        'text-transform:uppercase;font-weight:bold">LavernaEvents</p>'
        f'<p style="margin:0 0 16px;color:#1f2a44">Hi {escape(user.full_name)},</p>'
        f'<p style="margin:0 0 16px;color:#334155">{escape(subject)}:</p>'
        '<p style="margin:0 0 16px;font-size:32px;letter-spacing:8px;font-weight:bold;'
        f'color:#1f2a44">{escape(code)}</p>'
        '<p style="margin:0;color:#94a3b8;font-size:12px">This code expires in 10 minutes. '
        "Never share it with anyone. If you did not ask for it, ignore this email.</p></div>"
    )

    email = EmailMultiAlternatives(
        subject=subject,
        body=message,
        from_email=None,
        to=[user.email],
    )
    email.attach_alternative(html, "text/html")
    email.send(fail_silently=False)


def _send_sms_fast2sms(user: User, message: str, code: str) -> None:
    """OTP SMS through Fast2SMS (Indian numbers only).

    FAST2SMS_OTP_ROUTE:
        q     (default) free text, no DLT - for testing
        dlt   approved sender + template; needs FAST2SMS_SENDER_ID and
              FAST2SMS_OTP_TEMPLATE_ID (a template with ONE variable)
        otp   Fast2SMS's own OTP route
    """

    import requests

    api_key = config("FAST2SMS_API_KEY", default="")

    if not api_key:
        raise RuntimeError("FAST2SMS_API_KEY is not set.")

    if not is_default_country_number(user.mobile_number):
        raise RuntimeError("Fast2SMS can only send to Indian mobile numbers.")

    number = normalize_phone_digits(user.mobile_number)[-10:]
    route = config("FAST2SMS_OTP_ROUTE", default="q").strip().lower()

    payload = {"numbers": number, "flash": 0}

    if route == "dlt":
        sender_id = config("FAST2SMS_SENDER_ID", default="")
        template_id = config("FAST2SMS_OTP_TEMPLATE_ID", default="")

        if not (sender_id and template_id):
            raise RuntimeError("FAST2SMS_SENDER_ID / FAST2SMS_OTP_TEMPLATE_ID missing.")

        payload.update(
            route="dlt",
            sender_id=sender_id,
            message=template_id,
            variables_values=code,
        )
    elif route == "otp":
        payload.update(route="otp", variables_values=code)
    else:
        payload.update(route="q", message=message)

    response = requests.post(
        "https://www.fast2sms.com/dev/bulkV2",
        json=payload,
        headers={"authorization": api_key, "Content-Type": "application/json"},
        timeout=20,
    )

    try:
        data = response.json()
    except ValueError:
        data = {"message": response.text[:200]}

    if response.status_code != 200 or not data.get("return"):
        raise RuntimeError(f"Fast2SMS rejected the OTP SMS: {data.get('message')}")


def _send_sms_twilio(user: User, message: str) -> None:
    from twilio.rest import Client

    client = Client(config("TWILIO_ACCOUNT_SID"), config("TWILIO_AUTH_TOKEN"))

    client.messages.create(
        to=to_e164(user.mobile_number),
        from_=config("TWILIO_SMS_FROM_NUMBER"),
        body=message,
    )


def _send_otp_sms(user: User, message: str, subject: str, code: str) -> None:
    provider = config("SMS_PROVIDER", default="fast2sms").strip().lower()

    if provider == "twilio":
        _send_sms_twilio(user, message)
    else:
        _send_sms_fast2sms(user, message, code)


_DELIVERERS = {
    "console": _send_otp_console,
    "email": _send_otp_email,
    "sms": _send_otp_sms,
}


def describe_delivery(otp: MobileOTP) -> str:
    """Where the code actually went, in words for the success message."""

    delivered = getattr(otp, "delivered_via", [])

    parts = []

    if "sms" in delivered:
        parts.append("mobile number")

    if "email" in delivered:
        parts.append("email")

    if not parts:
        return "generated"

    return "sent to your " + " and ".join(parts)


# ---------------------------------------------------------------------
# Sending a code
# ---------------------------------------------------------------------

_PURPOSE_TEXT = {
    MobileOTP.Purpose.VERIFY_MOBILE: (
        "Your LavernaEvents verification code",
        "Your LavernaEvents verification code is {code}. It expires in 10 minutes. Do not share it.",
    ),
    MobileOTP.Purpose.RESET_PASSWORD: (
        "Your LavernaEvents password reset code",
        "Your LavernaEvents password reset code is {code}. It expires in 10 minutes. Do not share it.",
    ),
}


def send_otp(user: User, purpose: str) -> MobileOTP:
    """Create a code for `purpose` and deliver it by every OTP_DELIVERY mode.

    Raises OTPThrottled when asked again within the cooldown or more than
    MAX_OTPS_PER_HOUR times in an hour (protects SMS cost and inboxes).
    """

    now = timezone.now()

    last = (
        MobileOTP.objects.filter(user=user, purpose=purpose)
        .order_by("-created_at")
        .first()
    )

    if last is not None:
        wait = RESEND_COOLDOWN_SECONDS - (now - last.created_at).total_seconds()

        if wait > 0:
            raise OTPThrottled(
                int(wait) + 1,
                f"Please wait {int(wait) + 1} seconds before asking for another code.",
            )

    recent = MobileOTP.objects.filter(
        user=user,
        purpose=purpose,
        created_at__gte=now - timedelta(hours=1),
    ).count()

    if recent >= MAX_OTPS_PER_HOUR:
        raise OTPThrottled(
            3600,
            "Too many codes requested. Please try again in an hour.",
        )

    otp = MobileOTP.create_for_user(user, purpose=purpose)

    subject, template = _PURPOSE_TEXT[purpose]
    message = template.format(code=otp.code)

    delivered = []

    for mode in _delivery_modes():
        deliverer = _DELIVERERS.get(mode)

        if deliverer is None:
            logger.warning("Unknown OTP_DELIVERY mode '%s' ignored.", mode)
            continue

        try:
            deliverer(user, message, subject, otp.code)
            delivered.append(mode)
        except Exception:
            logger.exception("OTP delivery by '%s' failed for user %s.", mode, user.pk)

    otp.delivered_via = delivered

    return otp


def send_verification_otp(user: User) -> MobileOTP:
    """Mobile-verification code (kept under its old name for callers)."""

    return send_otp(user, MobileOTP.Purpose.VERIFY_MOBILE)


# ---------------------------------------------------------------------
# Checking a code
# ---------------------------------------------------------------------

def _check_otp(user: User, code: str, purpose: str) -> tuple[bool, str]:
    """Check a typed code against the user's latest unused code.

    Wrong guesses are counted; after MobileOTP.MAX_ATTEMPTS the code dies.
    """

    with transaction.atomic():
        otp = (
            MobileOTP.objects.select_for_update()
            .filter(user=user, purpose=purpose, is_used=False)
            .order_by("-created_at")
            .first()
        )

        if otp is None:
            return False, GENERIC_BAD_CODE

        if timezone.now() > otp.expires_at:
            otp.is_used = True
            otp.save(update_fields=["is_used"])
            return False, "This code has expired. Please request a new one."

        if otp.attempts >= MobileOTP.MAX_ATTEMPTS:
            otp.is_used = True
            otp.save(update_fields=["is_used"])
            return False, "Too many wrong attempts. Please request a new code."

        if not hmac.compare_digest(otp.code, str(code or "").strip()):
            otp.attempts += 1

            if otp.attempts >= MobileOTP.MAX_ATTEMPTS:
                otp.is_used = True
                otp.save(update_fields=["attempts", "is_used"])
                return False, "Too many wrong attempts. Please request a new code."

            otp.save(update_fields=["attempts"])

            left = MobileOTP.MAX_ATTEMPTS - otp.attempts

            return False, f"Incorrect code. {left} attempt{'s' if left != 1 else ''} left."

        otp.is_used = True
        otp.save(update_fields=["is_used"])

    return True, ""


def verify_otp_code(mobile_number: str, code: str) -> tuple[bool, str]:
    """Verify the registration code. On success the user is marked verified."""

    user = get_user_by_mobile(mobile_number)

    if user is None:
        return False, GENERIC_BAD_CODE

    if user.is_verified:
        return False, "This account is already verified."

    ok, message = _check_otp(user, code, MobileOTP.Purpose.VERIFY_MOBILE)

    if not ok:
        return False, message

    user.is_verified = True
    user.save(update_fields=["is_verified", "updated_at"])

    return True, "Mobile number verified successfully."


# ---------------------------------------------------------------------
# Password reset
# ---------------------------------------------------------------------

def revoke_user_sessions(user: User) -> None:
    """Blacklist every refresh token so existing logins stop working."""

    from rest_framework_simplejwt.token_blacklist.models import (
        BlacklistedToken,
        OutstandingToken,
    )

    for token in OutstandingToken.objects.filter(user=user):
        BlacklistedToken.objects.get_or_create(token=token)


def request_password_reset(identifier: str) -> MobileOTP | None:
    """Send a reset code to the account's email / mobile.

    Returns None (and sends nothing) for an unknown, inactive or suspended
    account or when throttled; the caller shows the same generic message
    either way so nobody can discover which accounts exist.
    """

    user = find_user_by_identifier(identifier)

    if user is None or not user.is_active or user.is_suspended:
        return None

    try:
        return send_otp(user, MobileOTP.Purpose.RESET_PASSWORD)
    except OTPThrottled as throttled:
        logger.info("Password reset code throttled for user %s: %s", user.pk, throttled.message)
        return None


def reset_password_with_otp(identifier: str, code: str, new_password: str) -> tuple[bool, str]:
    """Check the code and set the new password. All old logins are ended."""

    user = find_user_by_identifier(identifier)

    if user is None or not user.is_active or user.is_suspended:
        return False, GENERIC_BAD_CODE

    ok, message = _check_otp(user, code, MobileOTP.Purpose.RESET_PASSWORD)

    if not ok:
        return False, message

    user.set_password(new_password)
    user.save(update_fields=["password", "updated_at"])

    revoke_user_sessions(user)

    return True, "Password reset successfully. You can now log in."