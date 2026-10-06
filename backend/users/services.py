import logging

from decouple import config
from django.core.mail import send_mail

from .models import MobileOTP, User

logger = logging.getLogger(__name__)


def _delivery_modes() -> list[str]:
    """Read OTP_DELIVERY, a comma-separated list of: console, email, sms.

    Examples:
        OTP_DELIVERY=console                (local development, the default)
        OTP_DELIVERY=console,email          (hosted testing)
        OTP_DELIVERY=sms                    (production with a paid SMS route)
    """

    raw = config("OTP_DELIVERY", default="console")

    return [mode.strip().lower() for mode in raw.split(",") if mode.strip()]


def _format_e164(mobile_number: str) -> str:
    digits = (mobile_number or "").lstrip("0")
    country_code = config("DEFAULT_COUNTRY_CODE", default="91")

    if not digits.startswith(country_code):
        digits = f"{country_code}{digits}"

    return f"+{digits}"


def _send_otp_console(user: User, message: str) -> None:
    print(
        "\n"
        "==================== SMS OTP ====================\n"
        f"To: {user.mobile_number}\n"
        f"Message: {message}\n"
        "=================================================\n"
    )


def _send_otp_email(user: User, message: str) -> None:
    if not user.email:
        return

    send_mail(
        subject="Your LavernaEvents verification code",
        message=message,
        from_email=None,
        recipient_list=[user.email],
        fail_silently=False,
    )


def _send_otp_sms(user: User, message: str) -> None:
    from twilio.rest import Client

    client = Client(
        config("TWILIO_ACCOUNT_SID"),
        config("TWILIO_AUTH_TOKEN"),
    )

    client.messages.create(
        to=_format_e164(user.mobile_number),
        from_=config("TWILIO_SMS_FROM_NUMBER"),
        body=message,
    )


_DELIVERERS = {
    "console": _send_otp_console,
    "email": _send_otp_email,
    "sms": _send_otp_sms,
}


def send_verification_otp(user: User) -> MobileOTP:
    """Generate an OTP and deliver it using the methods in OTP_DELIVERY.

    Each method is tried independently. A failure in one (for example a
    Twilio trial restriction) is logged and never blocks registration -
    the user can always use "Resend code".
    """

    otp = MobileOTP.create_for_user(user)

    message = (
        f"Your LavernaEvents verification code is {otp.code}. "
        "It expires in 10 minutes."
    )

    for mode in _delivery_modes():
        deliverer = _DELIVERERS.get(mode)

        if deliverer is None:
            logger.warning("Unknown OTP_DELIVERY mode '%s' ignored.", mode)
            continue

        try:
            deliverer(user, message)
        except Exception:
            logger.exception("OTP delivery by '%s' failed for user %s.", mode, user.pk)

    return otp


def verify_otp_code(mobile_number: str, code: str) -> tuple[bool, str]:
    """Validate an OTP code for the given mobile number.

    Returns a tuple of (success, message). On success, marks the user
    as verified and the OTP as used.
    """

    user = User.objects.filter(mobile_number=mobile_number).first()

    if user is None:
        return False, "No account found with this mobile number."

    if user.is_verified:
        return False, "This account is already verified."

    otp = (
        MobileOTP.objects.filter(
            user=user,
            code=code,
            is_used=False,
        )
        .order_by("-created_at")
        .first()
    )

    if otp is None:
        return False, "Invalid verification code."

    if not otp.is_valid():
        return False, "This verification code has expired."

    otp.is_used = True
    otp.save(update_fields=["is_used"])

    user.is_verified = True
    user.save(update_fields=["is_verified"])

    return True, "Mobile number verified successfully."