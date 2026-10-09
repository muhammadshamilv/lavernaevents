import logging
import re
import time
from email.utils import formataddr, parseaddr

from common.phone import default_country_code, stored_number_to_digits
from decouple import config
from django.conf import settings
from django.core.mail import EmailMultiAlternatives
from django.utils.html import escape
from django.db.models import Q
from django.utils import timezone
from guests.models import Guest
from invitations.models import ActiveFilledTemplate, Invitation, InvitationSend
from invitations.services import (
    InvitationError,
    format_event_time,
    generate_response_token,
    get_active_filled_template,
    render_active_template_for_guest,
    render_active_template_image,
)
from memberships.services import spend_invitation_quota, spend_voice_call_quota
from memberships.utils import (
    LimitExceededError,
    check_invitation_limit,
    check_platform_pool,
    check_voice_call_limit,
    spend_platform_pool,
)

from .models import NotificationLog


logger = logging.getLogger(__name__)


class NotificationError(Exception):
    """Raised when a notification send action cannot be completed."""

    def __init__(self, message: str, code: str = "notification_error"):
        self.message = message
        self.code = code
        super().__init__(message)


# Errors that mean "no further guest in this batch can succeed either" -
# a bulk send stops at the first one of these instead of failing every
# remaining guest one by one.
BULK_STOP_CODES = {
    "no_active_plan",
    "invitation_limit_exceeded",
    "voice_call_limit_exceeded",
    "voice_call_not_available",
    "platform_pool_exhausted",
    "no_active_template",
    "active_template_wrong_event",
    "voice_not_configured",
    "sms_not_configured",
    "event_not_active",
}


# ---------------------------------------------------------------------
# Links and message text
# ---------------------------------------------------------------------

def build_response_link(response_token: str) -> str:
    """Build the guest-facing secure response link for Accept/Reject/Maybe."""

    frontend_url = (
        getattr(settings, "FRONTEND_GUEST_RESPONSE_URL", "") or "http://localhost:5173/respond"
    ).rstrip("/")

    return f"{frontend_url}/{response_token}"


def build_calendar_link(invitation: Invitation) -> str:
    """Build the guest-facing .ics download link (kept for compatibility;
    the invitation page now carries its own Add to Calendar buttons)."""

    public_backend_url = config(
        "PUBLIC_BACKEND_URL",
        default="http://localhost:8000",
    ).rstrip("/")

    return f"{public_backend_url}/api/respond/{invitation.response_token}/calendar/"


def build_invitation_image_link(invitation: Invitation) -> str:
    """Public link to the rendered invitation card image, or "" if there
    is no image or no PUBLIC_BACKEND_URL to build a reachable link from.

    WhatsApp (wa.me) and SMS can't carry an attachment, so for those
    channels the card is shared as a link instead. Email attaches the
    image directly and does not use this.

    With cloud storage (Supabase / S3) the file URL is already an absolute
    public https:// address and is returned as is; with local storage it
    is a relative /media/... path that gets PUBLIC_BACKEND_URL put in front.
    """

    if not invitation.image_file:
        return ""

    image_url = invitation.image_file.url

    if image_url.startswith("http://") or image_url.startswith("https://"):
        return image_url

    public_backend_url = config("PUBLIC_BACKEND_URL", default="").rstrip("/")

    if not public_backend_url:
        return ""

    return f"{public_backend_url}{image_url}"


def build_invitation_text(
    invitation: Invitation,
    response_link: str,
    channel: str = "",
    is_reminder: bool = False,
) -> str:
    """Letter-style invitation text used for WhatsApp (and as the plain-text
    part of the email). It mirrors the email: greeting, a short warm
    letter, the key details and ONE link to the invitation page that holds
    the card, the Yes / Maybe / No buttons, the location and Add to Calendar.
    """

    event = invitation.event
    guest = invitation.guest

    host = event.host_name or getattr(event.organizer, "full_name", "") or ""
    custom = (invitation.rendered_text or "").strip()

    heading = (
        "\u23F0 *Friendly reminder - you are invited!*"
        if is_reminder
        else "\U0001F48C *You are invited!*"
    )

    lines = [heading, "", f"Hi {guest.name},", ""]

    if custom:
        lines += [custom, ""]
    else:
        who = f"*{host}* has" if host else "You have been"
        lines += [
            f"{who} invited you to *{event.name}*. "
            "It would make the occasion truly special to have you with us.",
            "",
            f"\U0001F4C5 *Date:* {event.event_date.strftime('%A, %d %B %Y')}",
            f"\u23F0 *Time:* {format_event_time(event)}",
        ]

        if event.venue_name:
            lines.append(f"\U0001F4CD *Venue:* {event.venue_name}")

        lines.append("")

    lines += [
        "\U0001F3B4 Your personal invitation card, RSVP and location:",
        response_link,
        "",
        "Warm regards,",
        host or "LavernaEvents",
    ]

    return "\n".join(lines)


def build_sms_text(invitation: Invitation, response_link: str, is_reminder: bool = False) -> str:
    """Short SMS body that always keeps the invitation link intact."""

    event = invitation.event
    guest = invitation.guest

    suffix = f" View your invitation: {response_link}"
    prefix = (
        f"{'Reminder: ' if is_reminder else ''}Hi {guest.name}, you're invited to {event.name} "
        f"on {event.event_date.strftime('%d %b %Y')}."
    )

    max_prefix = 320 - len(suffix)

    if len(prefix) > max_prefix:
        prefix = prefix[: max_prefix - 3].rstrip() + "..."

    return prefix + suffix


_ML_WEEKDAYS = ["തിങ്കൾ", "ചൊവ്വ", "ബുധൻ", "വ്യാഴം", "വെള്ളി", "ശനി", "ഞായർ"]
_ML_MONTHS = [
    "ജനുവരി", "ഫെബ്രുവരി", "മാർച്ച്", "ഏപ്രിൽ", "മേയ്", "ജൂൺ",
    "ജൂലൈ", "ഓഗസ്റ്റ്", "സെപ്റ്റംബർ", "ഒക്ടോബർ", "നവംബർ", "ഡിസംബർ",
]


def get_voice_settings() -> tuple[str, str]:
    """(Twilio <Say> voice, language code) for the call, chosen by
    VOICE_CALL_LANGUAGE: "en" (English, India) or "ml" (Malayalam).

    VOICE_CALL_VOICE overrides the voice name if you want another one
    (see the Text-to-Speech voice list in the Twilio Console).
    """

    language = config("VOICE_CALL_LANGUAGE", default="en").strip().lower()

    if language == "ml":
        return config("VOICE_CALL_VOICE", default="Google.ml-IN-Standard-A"), "ml-IN"

    return config("VOICE_CALL_VOICE", default="Polly.Kajal-Neural"), "en-IN"


def _spoken_time_ml(value) -> str:
    """"7:30 PM" -> "വൈകുന്നേരം 7 മണി 30 മിനിറ്റ്" (period of day + hour)."""

    hour = value.hour

    if hour < 12:
        period = "രാവിലെ"
    elif hour < 16:
        period = "ഉച്ചയ്ക്ക്"
    elif hour < 19:
        period = "വൈകുന്നേരം"
    else:
        period = "രാത്രി"

    spoken = f"{value.hour % 12 or 12} മണി"

    if value.minute:
        spoken += f" {value.minute} മിനിറ്റ്"

    return f"{period} {spoken}"


def _build_voice_message_ml(invitation: Invitation) -> str:
    event = invitation.event
    guest = invitation.guest

    day = event.event_date
    when = f"{day.day} {_ML_MONTHS[day.month - 1]}, {_ML_WEEKDAYS[day.weekday()]}"

    if getattr(event, "event_end_time", None):
        at = f"{_spoken_time_ml(event.event_time)} മുതൽ {_spoken_time_ml(event.event_end_time)} വരെ"
    else:
        at = _spoken_time_ml(event.event_time)

    venue = f" {event.venue_name} ൽ വെച്ച്." if event.venue_name else ""

    host = event.host_name or getattr(event.organizer, "full_name", "") or ""
    inviter = f"{host} നിങ്ങളെ" if host else "നിങ്ങളെ"

    return (
        f"നമസ്കാരം {guest.name}. {inviter} {event.name} എന്ന പരിപാടിയിലേക്ക് ക്ഷണിക്കുന്നു. "
        f"{when}, {at}.{venue} "
        f"ക്ഷണക്കത്ത് നിങ്ങളുടെ സന്ദേശങ്ങളിൽ അയച്ചിട്ടുണ്ട്. നന്ദി."
    )


def build_voice_message(invitation: Invitation) -> str:
    """The short script read aloud on the voice call (about 15 seconds).

    It is built from the guest and event at the moment the call connects,
    so the name, event, date, time and venue are always the current ones.
    The language follows VOICE_CALL_LANGUAGE ("en" or "ml").
    """

    if get_voice_settings()[1] == "ml-IN":
        return _build_voice_message_ml(invitation)

    event = invitation.event
    guest = invitation.guest

    day = event.event_date
    when = f"{day.strftime('%A')}, {day.day} {day.strftime('%B')}"

    if getattr(event, "event_end_time", None):
        at = f"from {_spoken_time(event.event_time)} to {_spoken_time(event.event_end_time)}"
    else:
        at = f"at {_spoken_time(event.event_time)}"

    venue = f", at {event.venue_name}" if event.venue_name else ""

    host = event.host_name or getattr(event.organizer, "full_name", "") or ""
    inviter = f"{host} invites you" if host else "You are invited"

    return (
        f"Hello {guest.name}. {inviter} to {event.name}, "
        f"on {when}, {at}{venue}. "
        f"Please check your messages for the invitation. Thank you."
    )


def _spoken_time(value) -> str:
    """"7:30 PM" read naturally: "7 PM" on the hour."""

    text = value.strftime("%I:%M %p").lstrip("0")

    return text.replace(":00", "")


def normalize_phone_digits(mobile_number: str) -> str:
    """A guest's stored number as digits WITH the country code, e.g.
    "9188560170" -> "919188560170" and "447911123456" -> "447911123456".

    Delegates to the shared helper in common/phone.py so every app treats
    numbers the same way.
    """

    return stored_number_to_digits(mobile_number)


def build_wa_link(invitation, message: str) -> str:
    """Build a wa.me deep link (no WhatsApp Business API needed)."""

    from urllib.parse import quote

    mobile_number = normalize_phone_digits(invitation.guest.mobile_number)

    return f"https://wa.me/{mobile_number}?text={quote(message)}"


def _format_e164(mobile_number: str) -> str:
    """Format a guest's stored mobile number as E.164 for Twilio."""

    return f"+{normalize_phone_digits(mobile_number)}"


def _build_message_for_channel(invitation: Invitation, channel: str, is_reminder: bool = False) -> str:
    """Build the right message text for the channel being used."""

    response_link = build_response_link(invitation.response_token)

    if channel == NotificationLog.Channel.SMS:
        return build_sms_text(invitation, response_link, is_reminder)

    if channel == NotificationLog.Channel.VOICE_CALL:
        return build_voice_message(invitation)

    return build_invitation_text(invitation, response_link, channel, is_reminder)


# ---------------------------------------------------------------------
# Email identity
# ---------------------------------------------------------------------

def _clean_header_text(value: str) -> str:
    """Strip control characters (incl. newlines) so user-supplied text can
    never inject extra email headers."""

    return re.sub(r"[\x00-\x1f\x7f]+", " ", value or "").strip()


def build_email_identity(organizer) -> tuple[str, list[str]]:
    """Return (from_email, reply_to) for an invitation email.

    The message is sent from the platform's own address (so it passes
    SPF/DKIM and isn't spoofing the organizer's mailbox), shown to the
    guest as "<Organizer name> via LavernaEvents", with Reply-To set to
    the organizer's email so a guest's reply lands in their inbox.
    """

    default_from = getattr(settings, "DEFAULT_FROM_EMAIL", "") or ""
    _name, address = parseaddr(default_from)

    if not address:
        address = "no-reply@localhost"

    organizer_name = _clean_header_text(getattr(organizer, "full_name", ""))
    display_name = f"{organizer_name} via LavernaEvents" if organizer_name else "LavernaEvents"

    reply_to_email = _clean_header_text(getattr(organizer, "email", ""))
    reply_to = [reply_to_email] if reply_to_email and "@" in reply_to_email else []

    return formataddr((display_name, address)), reply_to


# ---------------------------------------------------------------------
# Channel handlers - every handler takes (invitation, message, organizer)
# ---------------------------------------------------------------------

def _send_via_whatsapp(invitation, message: str, organizer=None, is_reminder: bool = False) -> NotificationLog:
    """Build a wa.me deep link and log it as LINK_GENERATED (retry path only)."""

    wa_link = build_wa_link(invitation, message)

    return NotificationLog.objects.create(
        invitation=invitation,
        guest=invitation.guest,
        channel=NotificationLog.Channel.WHATSAPP,
        wa_link=wa_link,
        status=NotificationLog.Status.LINK_GENERATED,
    )


def _send_via_whatsapp_one_click(invitation, message: str, organizer=None, is_reminder: bool = False) -> NotificationLog:
    """Build the wa.me link and immediately record the send as SENT.

    wa.me opens WhatsApp on the organizer's own device with the message
    pre-filled; the organizer taps send there. The app cannot see whether
    that final tap happens, so the send is recorded when the link is
    generated and "Resend" is always available.
    """

    wa_link = build_wa_link(invitation, message)

    return NotificationLog.objects.create(
        invitation=invitation,
        guest=invitation.guest,
        channel=NotificationLog.Channel.WHATSAPP,
        wa_link=wa_link,
        status=NotificationLog.Status.SENT,
    )


def build_invitation_html(invitation: Invitation, response_link: str, image_link: str) -> str:
    """HTML invitation email laid out like the WhatsApp message: a warm
    letter, the invitation card, the key details and ONE button."""

    event = invitation.event
    guest = invitation.guest
    link = escape(response_link)

    host = event.host_name or getattr(event.organizer, "full_name", "") or ""
    letter_source = (invitation.rendered_text or "").strip()

    if letter_source:
        paragraphs = [p.strip() for p in letter_source.split("\n\n") if p.strip()]
        letter = "".join(
            f'<p style="margin:0 0 14px;color:#334155;font-size:15px;line-height:1.7">'
            f'{escape(p).replace(chr(10), "<br>")}</p>'
            for p in paragraphs
        )
        details_block = ""
    else:
        who = f"<b>{escape(host)}</b> has" if host else "You have been"
        letter = (
            f'<p style="margin:0 0 14px;color:#334155;font-size:16px;line-height:1.7">'
            f"Dear {escape(guest.name)},</p>"
            f'<p style="margin:0 0 14px;color:#334155;font-size:15px;line-height:1.7">'
            f"{who} invited you to <b>{escape(event.name)}</b>. "
            f"It would make the occasion truly special to have you with us. "
            f"Your personal invitation card is below.</p>"
        )
        details = [
            ("Date", event.event_date.strftime("%A, %d %B %Y")),
            ("Time", format_event_time(event)),
            ("Venue", event.venue_name or ""),
        ]
        rows = "".join(
            f'<tr><td style="padding:7px 0;color:#94a3b8;font-size:11px;letter-spacing:1.5px;'
            f'text-transform:uppercase;width:80px;vertical-align:top">{escape(label)}</td>'
            f'<td style="padding:7px 0;color:#1f2a44;font-size:15px;font-weight:600">{escape(value)}</td></tr>'
            for label, value in details
            if value
        )
        details_block = (
            '<tr><td style="padding:4px 28px 0"><table role="presentation" width="100%" '
            'cellpadding="0" cellspacing="0" style="background:#fdf2f8;border-radius:12px;padding:8px 16px">'
            f"{rows}</table></td></tr>"
        )

    card = (
        f'<tr><td style="padding:6px 20px 14px"><a href="{link}">'
        f'<img src="{escape(image_link)}" alt="Your invitation card" width="560" '
        f'style="display:block;width:100%;max-width:560px;height:auto;border-radius:14px;border:0"></a></td></tr>'
        if image_link
        else ""
    )

    return f"""<!doctype html>
<html><body style="margin:0;padding:0;background:#f4f1f8;font-family:Georgia,'Times New Roman',serif">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">{escape(guest.name)}, you are invited to {escape(event.name)}. Open your invitation.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1f8;padding:24px 12px">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:18px;overflow:hidden">
<tr><td style="background:#C2185B;padding:26px 24px;text-align:center">
<p style="margin:0;color:#fbcfe8;font-family:Arial,sans-serif;font-size:11px;letter-spacing:4px;text-transform:uppercase">You are invited</p>
<h1 style="margin:10px 0 0;color:#ffffff;font-size:27px;line-height:1.25;font-weight:normal">{escape(event.name)}</h1>
</td></tr>
<tr><td style="padding:26px 28px 8px">
<p style="margin:0 0 14px;color:#1f2a44;font-size:18px">Hi {escape(guest.name)},</p>
{letter}
</td></tr>
{card}
{details_block}
<tr><td align="center" style="padding:26px 24px 10px">
<a href="{link}" style="display:inline-block;background:#C2185B;color:#ffffff;text-decoration:none;font-family:Arial,sans-serif;font-weight:bold;font-size:16px;padding:15px 36px;border-radius:12px">View your invitation</a>
<p style="margin:14px 0 0;color:#94a3b8;font-family:Arial,sans-serif;font-size:12px">Let us know if you can come, see the location and add it to your calendar.</p>
</td></tr>
<tr><td style="padding:10px 24px 24px;text-align:center;color:#94a3b8;font-family:Arial,sans-serif;font-size:11px">
Button not working? Open this link:<br><a href="{link}" style="color:#64748b;word-break:break-all">{link}</a>
</td></tr>
</table>
<p style="color:#94a3b8;font-family:Arial,sans-serif;font-size:11px;margin:14px 0 0">Sent with LavernaEvents</p>
</td></tr></table></body></html>"""


def _send_via_email(invitation, message: str, organizer=None, is_reminder: bool = False) -> NotificationLog:
    """Send the invitation by email from the platform address, shown as
    "<Organizer> via LavernaEvents", with Reply-To set to the organizer.

    The email is HTML (card image + one "View your invitation" button)
    with the plain-text message as the fallback version, and the card is
    also attached so the guest can save it."""

    guest = invitation.guest

    if not guest.email:
        raise NotificationError(
            "This guest has no email address on file.",
            code="missing_email",
        )

    log = NotificationLog.objects.create(
        invitation=invitation,
        guest=guest,
        channel=NotificationLog.Channel.EMAIL,
        status=NotificationLog.Status.LINK_GENERATED,
    )

    from_email, reply_to = build_email_identity(organizer or invitation.event.organizer)

    try:
        response_link = build_response_link(invitation.response_token)
        image_link = build_invitation_image_link(invitation)

        email = EmailMultiAlternatives(
            subject=_clean_header_text(
                f"{'Reminder: ' if is_reminder else ''}You're invited to {invitation.event.name}!"
            ),
            body=message,
            from_email=from_email,
            to=[guest.email],
            reply_to=reply_to or None,
        )

        email.attach_alternative(
            build_invitation_html(invitation, response_link, image_link),
            "text/html",
        )

        if invitation.image_file:
            # Read through Django's storage layer so this works for local
            # disk AND cloud storage (cloud files have no filesystem path).
            attachment_name = invitation.image_file.name.rsplit("/", 1)[-1]

            with invitation.image_file.open("rb") as image_handle:
                email.attach(attachment_name, image_handle.read(), "image/jpeg")

        email.send(fail_silently=False)

    except Exception as exc:
        logger.exception("Invitation email to %s failed", guest.email)

        log.status = NotificationLog.Status.FAILED
        log.failure_reason = str(exc)[:255]
        log.save(update_fields=["status", "failure_reason", "updated_at"])

        raise NotificationError(
            "Failed to send email. Please try again.",
            code="email_send_failed",
        )

    log.status = NotificationLog.Status.SENT
    log.save(update_fields=["status", "updated_at"])

    return log


# Plain-language reasons for the Twilio errors organizers actually hit.
_TWILIO_ERROR_HINTS = {
    20003: "Twilio rejected the login (Account SID / Auth Token are wrong).",
    21211: "That mobile number is not valid.",
    21214: "That mobile number cannot receive messages.",
    21408: "Twilio is not allowed to send to this country yet (enable it under Messaging / Voice geo permissions).",
    21606: "The 'from' number is not a Twilio number that can send SMS.",
    21608: "Trial account: this number is not verified in Twilio. Verify it under Verified Caller IDs, or upgrade.",
    21610: "This guest has opted out of messages.",
    21612: "Twilio cannot send from this number to that destination.",
    21614: "That mobile number is not a valid mobile number.",
    21215: "Calls to this country are not enabled (Voice geo permissions).",
    21219: "Trial account: this number is not verified in Twilio. Verify it under Verified Caller IDs, or upgrade.",
    21210: "The 'from' number is not a verified or owned Twilio number.",
    21212: "The 'from' number is not a valid phone number.",
    30003: "The phone could not be reached.",
    30004: "The message was blocked by the guest's phone or carrier.",
    30005: "The number does not exist or is not in service.",
    30006: "The number is a landline or unreachable carrier.",
    30007: "The carrier filtered the message (common for India without DLT registration).",
    30008: "The message could not be delivered (carrier error).",
}


def _twilio_client(account_sid: str, auth_token: str):
    """Twilio client with a request timeout, so a slow Twilio can never hang
    a web worker indefinitely."""

    from twilio.http.http_client import TwilioHttpClient
    from twilio.rest import Client

    return Client(account_sid, auth_token, http_client=TwilioHttpClient(timeout=15))


def _twilio_failure(exc: Exception, what: str) -> tuple[str, str]:
    """Turn a Twilio exception into (message for the organizer, text for
    the log row). Also logs the full error for the server logs."""

    code = getattr(exc, "code", None)
    twilio_message = getattr(exc, "msg", "") or str(exc)

    logger.error("Twilio %s failed: code=%s message=%s", what, code, twilio_message)

    hint = _TWILIO_ERROR_HINTS.get(code)

    if hint:
        shown = f"{what} failed: {hint} (Twilio code {code})"
    elif code:
        shown = f"{what} failed (Twilio code {code}): {twilio_message[:140]}"
    else:
        shown = f"{what} failed: {twilio_message[:160]}"

    return shown, f"{code or ''} {twilio_message}".strip()[:255]


def _fast2sms_failure(response_json: dict, http_status: int) -> tuple[str, str]:
    """(organizer message, log text) for a failed Fast2SMS response."""

    raw = response_json.get("message", "")
    detail = ", ".join(str(m) for m in raw) if isinstance(raw, list) else str(raw)
    detail = detail or f"HTTP {http_status}"
    code = response_json.get("status_code", http_status)

    logger.error("Fast2SMS failed: code=%s message=%s", code, detail)

    lowered = detail.lower()

    if "balance" in lowered or "insufficient" in lowered or code == 999:
        shown = "SMS failed: the Fast2SMS wallet has no balance. Please recharge it."
    elif "invalid authentication" in lowered or code == 412:
        shown = "SMS failed: the Fast2SMS API key is wrong."
    elif "template" in lowered or "sender" in lowered:
        shown = f"SMS failed: Fast2SMS rejected the sender ID / template ({detail[:120]})."
    else:
        shown = f"SMS failed (Fast2SMS code {code}): {detail[:140]}"

    return shown, f"{code} {detail}"[:255]


def _send_via_fast2sms(invitation, log, guest, is_reminder: bool = False) -> NotificationLog:
    """Send the SMS through Fast2SMS (Indian numbers).

    FAST2SMS_ROUTE=dlt (default, production): uses the DLT-approved
    sender id + template id; the template variables are filled from
    FAST2SMS_VARIABLES (default "name,event,date,link", in template order).
    FAST2SMS_ROUTE=q (quick route, no DLT, for testing): sends free text.
    """

    import requests

    api_key = config("FAST2SMS_API_KEY", default="")
    route = config("FAST2SMS_ROUTE", default="dlt").strip().lower()
    sender_id = config("FAST2SMS_SENDER_ID", default="")
    template_id = config("FAST2SMS_TEMPLATE_ID", default="")

    if not api_key or (route == "dlt" and not (sender_id and template_id)):
        log.status = NotificationLog.Status.FAILED
        log.failure_reason = "Fast2SMS is not configured (API key, sender id or template id missing)."
        log.save(update_fields=["status", "failure_reason", "updated_at"])

        raise NotificationError(
            "SMS isn't set up yet. Please contact support.",
            code="sms_not_configured",
        )

    event = invitation.event
    response_link = build_response_link(invitation.response_token)

    # Fast2SMS only delivers to Indian numbers and wants the 10-digit
    # national number, no country code.
    full_digits = normalize_phone_digits(invitation.guest.mobile_number)
    country_code = default_country_code()

    if not (full_digits.startswith(country_code) and len(full_digits) == len(country_code) + 10):
        log.status = NotificationLog.Status.FAILED
        log.failure_reason = "Fast2SMS can only send to Indian numbers."
        log.save(update_fields=["status", "failure_reason", "updated_at"])

        raise NotificationError(
            "This guest's number is not an Indian mobile number, so it can't be reached by SMS. "
            "Try WhatsApp or Email instead.",
            code="sms_international_unsupported",
        )

    number = full_digits[len(country_code):]

    if route == "dlt":
        values = {
            "name": guest.name,
            "event": event.name,
            "date": event.event_date.strftime("%d %b %Y"),
            "time": format_event_time(event),
            "venue": event.venue_name or "",
            "link": response_link,
        }
        order = [v.strip() for v in config("FAST2SMS_VARIABLES", default="name,event,date,link").split(",") if v.strip()]

        payload = {
            "route": "dlt",
            "sender_id": sender_id,
            "message": template_id,
            "variables_values": "|".join(str(values.get(k, "")) for k in order),
            "flash": 0,
            "numbers": number,
        }
    else:
        payload = {
            "route": "q",
            "message": build_sms_text(invitation, response_link, is_reminder),
            "flash": 0,
            "numbers": number,
        }

    try:
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

        ok = bool(data.get("return")) and response.status_code == 200

    except Exception as exc:
        logger.exception("Fast2SMS request failed")
        data, ok = {"message": f"could not reach Fast2SMS ({exc.__class__.__name__})"}, False
        response = None

    if not ok:
        shown, reason = _fast2sms_failure(data, response.status_code if response is not None else 0)

        log.status = NotificationLog.Status.FAILED
        log.failure_reason = reason
        log.save(update_fields=["status", "failure_reason", "updated_at"])

        raise NotificationError(shown, code="sms_send_failed")

    log.status = NotificationLog.Status.SENT
    log.save(update_fields=["status", "updated_at"])

    return log


def _send_via_sms(invitation, message: str, organizer=None, is_reminder: bool = False) -> NotificationLog:
    """Send the invitation by SMS. Provider is chosen with SMS_PROVIDER:
    "fast2sms" (default, India) or "twilio"."""

    guest = invitation.guest

    log = NotificationLog.objects.create(
        invitation=invitation,
        guest=guest,
        channel=NotificationLog.Channel.SMS,
        status=NotificationLog.Status.LINK_GENERATED,
    )

    if config("SMS_PROVIDER", default="fast2sms").strip().lower() != "twilio":
        return _send_via_fast2sms(invitation, log, guest, is_reminder)

    account_sid = config("TWILIO_ACCOUNT_SID", default="")
    auth_token = config("TWILIO_AUTH_TOKEN", default="")
    from_number = config("TWILIO_SMS_FROM_NUMBER", default=config("TWILIO_FROM_NUMBER", default=""))

    if not (account_sid and auth_token and from_number):
        log.status = NotificationLog.Status.FAILED
        log.failure_reason = "Twilio SMS is not configured (SID, token or from number missing)."
        log.save(update_fields=["status", "failure_reason", "updated_at"])

        raise NotificationError(
            "SMS isn't set up yet. Please contact support.",
            code="sms_not_configured",
        )

    try:
        client = _twilio_client(account_sid, auth_token)

        client.messages.create(
            to=_format_e164(guest.mobile_number),
            from_=from_number,
            body=message,
        )

    except Exception as exc:
        shown, reason = _twilio_failure(exc, "SMS")

        log.status = NotificationLog.Status.FAILED
        log.failure_reason = reason
        log.save(update_fields=["status", "failure_reason", "updated_at"])

        raise NotificationError(shown, code="sms_send_failed")

    log.status = NotificationLog.Status.SENT
    log.save(update_fields=["status", "updated_at"])

    return log


def _send_via_voice_call(invitation, message: str, organizer=None, is_reminder: bool = False) -> NotificationLog:
    """Place an outbound call via Twilio that reads the invitation aloud
    (see notifications/views.py's VoiceTwiMLView for the voice string)."""

    guest = invitation.guest

    log = NotificationLog.objects.create(
        invitation=invitation,
        guest=guest,
        channel=NotificationLog.Channel.VOICE_CALL,
        status=NotificationLog.Status.CALLING,
    )

    account_sid = config("TWILIO_ACCOUNT_SID", default="")
    auth_token = config("TWILIO_AUTH_TOKEN", default="")
    from_number = config("TWILIO_FROM_NUMBER", default="")
    public_backend_url = config("PUBLIC_BACKEND_URL", default="").rstrip("/")

    if not (account_sid and auth_token and from_number and public_backend_url):
        log.status = NotificationLog.Status.FAILED
        log.failure_reason = (
            "Voice calling is not configured (Twilio SID / token / from number "
            "or PUBLIC_BACKEND_URL missing)."
        )
        log.save(update_fields=["status", "failure_reason", "updated_at"])

        raise NotificationError(
            "Voice calling isn't configured yet. Please contact support.",
            code="voice_not_configured",
        )

    client = _twilio_client(account_sid, auth_token)

    twiml_url = f"{public_backend_url}/api/notifications/voice/twiml/{log.pk}/"
    status_callback_url = f"{public_backend_url}/api/notifications/voice/status/{log.pk}/"

    call_args = dict(
        to=_format_e164(guest.mobile_number),
        from_=from_number,
        url=twiml_url,
    )

    # Ask Twilio to report the call's outcome back to us. Trial accounts
    # may not use these extra parameters ("limited parameter access"); in
    # that case the call is placed without them and counted as sent.
    use_callback = config("TWILIO_VOICE_STATUS_CALLBACK", default=True, cast=bool)
    callback_args = dict(
        status_callback=status_callback_url,
        status_callback_event=["completed", "no-answer", "busy", "failed"],
        status_callback_method="POST",
    )

    call = None
    callback_used = False

    try:
        if use_callback:
            try:
                call = client.calls.create(**call_args, **callback_args)
                callback_used = True

            except Exception as exc:
                if "parameter" not in str(getattr(exc, "msg", "") or exc).lower():
                    raise

                logger.warning("Twilio rejected status callback params (trial?); retrying without them")

        if call is None:
            call = client.calls.create(**call_args)

    except Exception as exc:
        shown, reason = _twilio_failure(exc, "Call")

        log.status = NotificationLog.Status.FAILED
        log.failure_reason = reason
        log.save(update_fields=["status", "failure_reason", "updated_at"])

        raise NotificationError(shown, code="voice_call_failed")

    log.call_sid = call.sid

    if callback_used:
        log.save(update_fields=["call_sid", "updated_at"])
    else:
        # No callback will arrive to finish the log, so record it now.
        log.status = NotificationLog.Status.SENT
        log.save(update_fields=["call_sid", "status", "updated_at"])

    return log


CHANNEL_HANDLERS = {
    "WHATSAPP": _send_via_whatsapp_one_click,
    "EMAIL": _send_via_email,
    "SMS": _send_via_sms,
    "VOICE_CALL": _send_via_voice_call,
}

# ---------------------------------------------------------------------
# Invitation record (one per guest + template, shared by every channel)
# ---------------------------------------------------------------------

def _attach_invitation_image(invitation: Invitation, active: ActiveFilledTemplate, guest) -> None:
    """Render the organizer's filled values onto the template's background
    image and store it on the invitation. No-op for templates that have no
    background image."""

    if not active.template.background_image:
        return

    try:
        image_content = render_active_template_image(active, guest.name)

        if invitation.image_file:
            invitation.image_file.delete(save=False)

        invitation.image_file.save(
            f"invitation_{invitation.pk}.jpg",
            image_content,
            save=True,
        )

    except Exception:
        invitation.status = Invitation.Status.FAILED
        invitation.save(update_fields=["status", "updated_at"])

        raise InvitationError(
            "Invitation record created, but image rendering failed. "
            "Please contact support.",
            code="render_failed",
        )


def _get_or_create_invitation_for_active(active: ActiveFilledTemplate, guest) -> Invitation:
    """Get or create the Invitation row for this guest under the
    organizer's active filled template.

    The same Invitation (and response token) is reused whichever channel
    the organizer sends over. If the organizer has refilled the template
    since the invitation was last built, its text and image are rebuilt
    in place so guests never receive stale details.
    """

    template = active.template
    event = active.event

    existing = Invitation.objects.filter(guest=guest, template=template).first()

    if existing is not None:
        if existing.updated_at < active.updated_at:
            existing.rendered_text = render_active_template_for_guest(active, guest)
            existing.status = Invitation.Status.GENERATED
            existing.save(update_fields=["rendered_text", "status", "updated_at"])

            _attach_invitation_image(existing, active, guest)

        return existing

    rendered_text = render_active_template_for_guest(active, guest)

    try:
        invitation = Invitation.objects.create(
            event=event,
            guest=guest,
            template=template,
            response_token=generate_response_token(),
            rendered_text=rendered_text,
        )

    except Exception:
        invitation = Invitation.objects.filter(guest=guest, template=template).first()

        if invitation is not None:
            return invitation

        raise

    _attach_invitation_image(invitation, active, guest)

    return invitation


# ---------------------------------------------------------------------
# Sending
# ---------------------------------------------------------------------

def ensure_sendable_active_template(event, organizer) -> ActiveFilledTemplate:
    """Return the organizer's active filled template, or raise a clear
    InvitationError if there isn't one usable for this event."""

    active = get_active_filled_template(organizer)

    if active is None:
        raise InvitationError(
            "No template is currently selected. Go to the Templates page, "
            "select a template, fill it in, and confirm before sending.",
            code="no_active_template",
        )

    if active.event_id != event.id:
        raise InvitationError(
            "Your currently active template is set up for a different event. "
            "Go to the Templates page and select/fill a template for this event first.",
            code="active_template_wrong_event",
        )

    return active


def get_guest_last_channel(guest) -> str | None:
    """The channel this guest most recently received an invitation over."""

    log = (
        NotificationLog.objects.filter(
            guest=guest,
            status__in=[NotificationLog.Status.SENT, NotificationLog.Status.CALLING],
        )
        .order_by("-created_at")
        .first()
    )

    return log.channel if log is not None else None


def _record_send(
    event,
    guest,
    organizer,
    template,
    channel: str,
    succeeded: bool,
    is_reminder: bool,
    failure_reason: str = "",
) -> None:
    """Write the InvitationSend audit row that the Phase 24 reports read."""

    InvitationSend.objects.create(
        event=event,
        guest=guest,
        template=template,
        channel=channel,
        status=InvitationSend.Status.SENT if succeeded else InvitationSend.Status.FAILED,
        is_reminder=is_reminder,
        sent_by=organizer,
        sent_at=timezone.now() if succeeded else None,
        failure_reason=failure_reason[:255],
    )


def send_active_template_to_guest(
    event,
    guest,
    organizer,
    channel: str | None = None,
    is_reminder: bool = False,
) -> NotificationLog:
    """Send the organizer's ONE active filled template to this guest over
    the chosen channel.

    `channel` is now picked by the organizer on the Guests page at send
    time. If omitted, the active template's own channel is used (the old
    behavior), so existing callers keep working.

    Quota order: the organizer's own plan/topup quota first, then the
    platform-wide channel pool, so a failure message always says which of
    the two ran out.
    """

    if event.status in (event.Status.CANCELLED, event.Status.COMPLETED):
        raise NotificationError(
            f"This event is {event.get_status_display().lower()}, so invitations can't be sent. "
            "Re-open the event first.",
            code="event_not_active",
        )

    active = ensure_sendable_active_template(event, organizer)

    channel = channel or active.template.channel

    if channel not in CHANNEL_HANDLERS:
        raise NotificationError(
            "Channel must be one of: WHATSAPP, EMAIL, SMS, VOICE_CALL.",
            code="invalid_channel",
        )

    if channel == NotificationLog.Channel.EMAIL and not guest.email:
        raise NotificationError(
            "This guest has no email address on file.",
            code="missing_email",
        )

    try:
        if channel == NotificationLog.Channel.VOICE_CALL:
            check_voice_call_limit(organizer)
        else:
            check_invitation_limit(organizer)

        check_platform_pool(channel)

    except LimitExceededError as error:
        raise InvitationError(error.message, code=error.code)

    invitation = _get_or_create_invitation_for_active(active, guest)
    message = _build_message_for_channel(invitation, channel, is_reminder)

    try:
        log = CHANNEL_HANDLERS[channel](invitation, message, organizer, is_reminder=is_reminder)

    except NotificationError as error:
        _record_send(
            event, guest, organizer, active.template, channel,
            succeeded=False, is_reminder=is_reminder, failure_reason=error.message,
        )

        if guest.invitation_status == guest.InvitationStatus.NOT_SENT:
            guest.invitation_status = guest.InvitationStatus.FAILED
            guest.save(update_fields=["invitation_status", "updated_at"])

        raise

    if channel == NotificationLog.Channel.VOICE_CALL:
        spend_voice_call_quota(organizer)
    else:
        spend_invitation_quota(organizer)

    spend_platform_pool(channel)

    _record_send(
        event, guest, organizer, active.template, channel,
        succeeded=True, is_reminder=is_reminder,
    )

    if log.status == NotificationLog.Status.SENT:
        guest.invitation_status = guest.InvitationStatus.SENT
        guest.save(update_fields=["invitation_status", "updated_at"])

    return log


def mark_whatsapp_as_sent(log: NotificationLog) -> NotificationLog:
    """Mark a WhatsApp log as sent after the organizer confirms (retry path only)."""

    log.status = NotificationLog.Status.SENT
    log.save(update_fields=["status", "updated_at"])

    guest = log.guest
    guest.invitation_status = guest.InvitationStatus.SENT
    guest.save(update_fields=["invitation_status", "updated_at"])

    return log


def apply_voice_call_status_callback(log: NotificationLog, call_status: str) -> NotificationLog:
    """Update a voice call's log based on Twilio's status callback.

    Only a call that is still CALLING can change: a repeated or late
    callback never overwrites a result that is already recorded.
    """

    if log.status != NotificationLog.Status.CALLING:
        return log

    guest = log.guest

    if call_status == "completed":
        log.status = NotificationLog.Status.SENT
        log.save(update_fields=["status", "updated_at"])

        guest.invitation_status = guest.InvitationStatus.SENT
        guest.save(update_fields=["invitation_status", "updated_at"])

    elif call_status in ("no-answer", "busy", "failed", "canceled"):
        log.status = NotificationLog.Status.FAILED
        log.failure_reason = f"Call ended: {call_status}"
        log.save(update_fields=["status", "failure_reason", "updated_at"])

        if guest.invitation_status == guest.InvitationStatus.NOT_SENT:
            guest.invitation_status = guest.InvitationStatus.FAILED
            guest.save(update_fields=["invitation_status", "updated_at"])

    return log


def retry_notification(log: NotificationLog, organizer) -> NotificationLog:
    """Retry a FAILED send.

    The retry goes through exactly the same path as a first send
    (send_active_template_to_guest): the plan quota and platform pool are
    checked and spent, the audit row is written and the guest's status is
    updated. It uses the organizer's CURRENT active template. When it
    succeeds, the old failed row is removed so the send log doesn't show
    the same guest as both failed and sent (the InvitationSend audit rows
    keep the full history).
    """

    if log.status != NotificationLog.Status.FAILED:
        raise NotificationError(
            "Only a failed send can be retried.",
            code="not_retryable",
        )

    event = log.invitation.event

    new_log = send_active_template_to_guest(
        event=event,
        guest=log.guest,
        organizer=organizer,
        channel=log.channel,
    )

    new_log.retry_count = log.retry_count + 1
    new_log.save(update_fields=["retry_count", "updated_at"])

    log.delete()

    return new_log


# ---------------------------------------------------------------------
# Bulk sending (Email / SMS / Voice Call)
# ---------------------------------------------------------------------

def _resolve_bulk_queryset(
    event,
    channel: str,
    guest_ids,
    category_ids,
    include_uncategorized: bool,
    select_all: bool,
    skip_already_sent: bool,
    after_id: int,
):
    """The guests this bulk request targets, in a stable id order, that
    come AFTER `after_id` (the cursor the frontend advances batch by batch)."""

    queryset = Guest.objects.filter(event=event, id__gt=after_id)

    if not select_all:
        selector = Q()

        if guest_ids:
            selector |= Q(id__in=guest_ids)

        if category_ids:
            selector |= Q(category_id__in=category_ids)

        if include_uncategorized:
            selector |= Q(category__isnull=True)

        queryset = queryset.filter(selector)

    if skip_already_sent:
        already_sent = NotificationLog.objects.filter(
            invitation__event=event,
            channel=channel,
            status__in=[NotificationLog.Status.SENT, NotificationLog.Status.CALLING],
        ).values("guest_id")

        queryset = queryset.exclude(id__in=already_sent)

    return queryset.order_by("id")


def send_bulk_invitations(
    event,
    organizer,
    channel: str,
    *,
    guest_ids=None,
    category_ids=None,
    include_uncategorized: bool = False,
    select_all: bool = False,
    skip_already_sent: bool = True,
    after_id: int = 0,
    batch_size: int = 10,
) -> dict:
    """Send one BATCH of a bulk send and report what happened.

    The frontend calls this repeatedly, passing back `next_after_id`
    until `has_more` is false. That keeps every request short (no
    timeouts), lets the UI show real progress, and needs no Celery.

    A quota / platform-pool / no-template problem ends the whole run
    (the remaining guests are reported as not attempted); a problem with
    one guest (no email, provider error) is recorded and the run goes on.
    """

    if channel == NotificationLog.Channel.WHATSAPP:
        raise NotificationError(
            "WhatsApp invitations are sent one guest at a time.",
            code="bulk_not_supported",
        )

    ensure_sendable_active_template(event, organizer)

    queryset = _resolve_bulk_queryset(
        event, channel, guest_ids, category_ids,
        include_uncategorized, select_all, skip_already_sent, after_id,
    )

    total_matching = queryset.count()
    batch = list(queryset[:batch_size])

    results = []
    sent = failed = skipped = 0
    stopped_reason = ""
    last_id = after_id

    # Each request must finish well inside the web server's timeout, even
    # when rendering cards or calling a slow provider is slow: stop taking
    # new guests once the time budget is used up and let the next batch
    # carry on from the cursor.
    deadline = time.monotonic() + config("BULK_BATCH_TIME_BUDGET", default=20, cast=float)
    attempted = 0

    for guest in batch:
        if attempted and time.monotonic() > deadline:
            break

        attempted += 1
        last_id = guest.id

        try:
            send_active_template_to_guest(
                event=event,
                guest=guest,
                organizer=organizer,
                channel=channel,
            )

        except (InvitationError, NotificationError) as error:
            if error.code in BULK_STOP_CODES:
                stopped_reason = error.message
                break

            if error.code == "missing_email":
                skipped += 1
                results.append(
                    {"guest_id": guest.id, "guest_name": guest.name, "outcome": "skipped", "message": "No email address."}
                )
            else:
                failed += 1
                results.append(
                    {"guest_id": guest.id, "guest_name": guest.name, "outcome": "failed", "message": error.message}
                )

            continue

        sent += 1
        results.append(
            {"guest_id": guest.id, "guest_name": guest.name, "outcome": "sent", "message": ""}
        )

    stopped = bool(stopped_reason)
    has_more = (not stopped) and queryset.filter(id__gt=last_id).exists()

    return {
        "channel": channel,
        "total_matching": total_matching,
        "processed": len(results),
        "sent": sent,
        "failed": failed,
        "skipped": skipped,
        "results": results,
        "has_more": has_more,
        "next_after_id": last_id if has_more else None,
        "stopped": stopped,
        "stopped_reason": stopped_reason,
        "not_attempted": (total_matching - len(results)) if stopped else 0,
    }


# ---------------------------------------------------------------------
# Reminders
# ---------------------------------------------------------------------

def send_reminder_to_guest(event, guest, organizer, channel: str | None = None) -> NotificationLog:
    """Send a reminder using the organizer's active filled template.

    By default the reminder goes out over the SAME channel the guest's
    invitation last went out on (not necessarily the template's own
    channel any more, since the organizer picks the channel at send time).
    The InvitationSend audit row (is_reminder=True) is written by
    send_active_template_to_guest itself.
    """

    if guest.response_status != guest.ResponseStatus.PENDING:
        raise NotificationError(
            "This guest has already responded, so no reminder is needed.",
            code="guest_already_responded",
        )

    if channel is None:
        channel = get_guest_last_channel(guest)

    if channel is None:
        raise NotificationError(
            "This guest hasn't been sent an invitation yet - send the invitation first.",
            code="no_previous_invitation",
        )

    return send_active_template_to_guest(
        event=event,
        guest=guest,
        organizer=organizer,
        channel=channel,
        is_reminder=True,
    )