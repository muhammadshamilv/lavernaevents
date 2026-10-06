import re
from email.utils import formataddr, parseaddr

from decouple import config
from django.conf import settings
from django.core.mail import EmailMessage
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
}


# ---------------------------------------------------------------------
# Links and message text
# ---------------------------------------------------------------------

def build_response_link(response_token: str) -> str:
    """Build the guest-facing secure response link for Accept/Reject/Maybe."""

    frontend_url = config(
        "FRONTEND_GUEST_RESPONSE_URL",
        default="http://localhost:5173/respond",
    )

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


def build_invitation_text(invitation: Invitation, response_link: str, channel: str = "") -> str:
    """Build the plain-text invitation message for Email / WhatsApp.

    The guest gets ONE link, "View your invitation". That page holds the
    invitation card, the Yes / Maybe / No attendance buttons, the
    location and the Add to Calendar buttons.
    """

    event = invitation.event
    guest = invitation.guest

    if invitation.rendered_text:
        body = invitation.rendered_text
    else:
        body = (
            f"Hello {guest.name},\n\n"
            f"You are invited to {event.name}!\n\n"
            f"Date: {event.event_date.strftime('%d %B %Y')}\n"
            f"Time: {format_event_time(event)}\n"
            f"Venue: {event.venue_name}"
        )

    return f"{body}\n\nView your invitation:\n{response_link}"


def build_sms_text(invitation: Invitation, response_link: str) -> str:
    """Short SMS body that always keeps the invitation link intact."""

    event = invitation.event
    guest = invitation.guest

    suffix = f" View your invitation: {response_link}"
    prefix = (
        f"Hi {guest.name}, you're invited to {event.name} "
        f"on {event.event_date.strftime('%d %b %Y')}."
    )

    max_prefix = 320 - len(suffix)

    if len(prefix) > max_prefix:
        prefix = prefix[: max_prefix - 3].rstrip() + "..."

    return prefix + suffix


def build_voice_message(invitation: Invitation) -> str:
    """Build the message READ ALOUD during a voice call.

    Always a short, clean spoken script (it never reads the written
    invitation text out): the guest's name first, then the invitation and
    the event details, repeated once so the guest can catch them.
    """

    event = invitation.event
    guest = invitation.guest

    when = event.event_date.strftime("%A, %d %B %Y")

    if getattr(event, "event_end_time", None):
        at = (
            f"from {_spoken_time(event.event_time)} "
            f"to {_spoken_time(event.event_end_time)}"
        )
    else:
        at = f"at {_spoken_time(event.event_time)}"

    venue = f", at {event.venue_name}" if event.venue_name else ""

    host = event.host_name or getattr(event.organizer, "full_name", "") or ""
    from_host = f" from {host}" if host else ""

    details = f"{event.name}, on {when}, {at}{venue}"

    return (
        f"Hello {guest.name}. You are warmly invited{from_host} to {details}. "
        f"Once again, {details}. "
        f"We have also sent you the invitation card. Please check your messages "
        f"to confirm your attendance. We look forward to seeing you. Thank you."
    )


def _spoken_time(value) -> str:
    """"7:30 PM" read naturally: "7 PM" on the hour."""

    text = value.strftime("%I:%M %p").lstrip("0")

    return text.replace(":00", "")


def build_wa_link(invitation, message: str) -> str:
    """Build a wa.me deep link (no WhatsApp Business API needed)."""

    from urllib.parse import quote

    mobile_number = invitation.guest.mobile_number.lstrip("0")

    country_code = config("DEFAULT_COUNTRY_CODE", default="91")

    if not mobile_number.startswith(country_code):
        mobile_number = f"{country_code}{mobile_number}"

    return f"https://wa.me/{mobile_number}?text={quote(message)}"


def _format_e164(mobile_number: str) -> str:
    """Format a guest's stored mobile number as E.164 for Twilio."""

    digits = mobile_number.lstrip("0")
    country_code = config("DEFAULT_COUNTRY_CODE", default="91")

    if not digits.startswith(country_code):
        digits = f"{country_code}{digits}"

    return f"+{digits}"


def _build_message_for_channel(invitation: Invitation, channel: str) -> str:
    """Build the right message text for the channel being used."""

    response_link = build_response_link(invitation.response_token)

    if channel == NotificationLog.Channel.SMS:
        return build_sms_text(invitation, response_link)

    if channel == NotificationLog.Channel.VOICE_CALL:
        return build_voice_message(invitation)

    return build_invitation_text(invitation, response_link, channel)


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

def _send_via_whatsapp(invitation, message: str, organizer=None) -> NotificationLog:
    """Build a wa.me deep link and log it as LINK_GENERATED (retry path only)."""

    wa_link = build_wa_link(invitation, message)

    return NotificationLog.objects.create(
        invitation=invitation,
        guest=invitation.guest,
        channel=NotificationLog.Channel.WHATSAPP,
        wa_link=wa_link,
        status=NotificationLog.Status.LINK_GENERATED,
    )


def _send_via_whatsapp_one_click(invitation, message: str, organizer=None) -> NotificationLog:
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


def _send_via_email(invitation, message: str, organizer=None) -> NotificationLog:
    """Send the invitation by email from the platform address, shown as
    "<Organizer> via LavernaEvents", with Reply-To set to the organizer."""

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
        email = EmailMessage(
            subject=f"You're invited to {invitation.event.name}!",
            body=message,
            from_email=from_email,
            to=[guest.email],
            reply_to=reply_to or None,
        )

        if invitation.image_file:
            # Read through Django's storage layer so this works for local
            # disk AND cloud storage (cloud files have no filesystem path).
            attachment_name = invitation.image_file.name.rsplit("/", 1)[-1]

            with invitation.image_file.open("rb") as image_handle:
                email.attach(attachment_name, image_handle.read(), "image/jpeg")

        email.send(fail_silently=False)

    except Exception as exc:
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


def _send_via_sms(invitation, message: str, organizer=None) -> NotificationLog:
    """Send the invitation via SMS from the platform's Twilio number."""

    from twilio.rest import Client

    guest = invitation.guest

    log = NotificationLog.objects.create(
        invitation=invitation,
        guest=guest,
        channel=NotificationLog.Channel.SMS,
        status=NotificationLog.Status.LINK_GENERATED,
    )

    account_sid = config("TWILIO_ACCOUNT_SID")
    auth_token = config("TWILIO_AUTH_TOKEN")
    from_number = config("TWILIO_SMS_FROM_NUMBER", default=config("TWILIO_FROM_NUMBER", default=""))

    try:
        client = Client(account_sid, auth_token)

        client.messages.create(
            to=_format_e164(guest.mobile_number),
            from_=from_number,
            body=message,
        )

    except Exception as exc:
        log.status = NotificationLog.Status.FAILED
        log.failure_reason = str(exc)[:255]
        log.save(update_fields=["status", "failure_reason", "updated_at"])

        raise NotificationError(
            "Failed to send SMS. Please try again.",
            code="sms_send_failed",
        )

    log.status = NotificationLog.Status.SENT
    log.save(update_fields=["status", "updated_at"])

    return log


def _send_via_voice_call(invitation, message: str, organizer=None) -> NotificationLog:
    """Place an outbound call via Twilio that reads the invitation aloud
    (see notifications/views.py's VoiceTwiMLView for the voice string)."""

    from twilio.rest import Client

    guest = invitation.guest

    log = NotificationLog.objects.create(
        invitation=invitation,
        guest=guest,
        channel=NotificationLog.Channel.VOICE_CALL,
        status=NotificationLog.Status.CALLING,
    )

    account_sid = config("TWILIO_ACCOUNT_SID")
    auth_token = config("TWILIO_AUTH_TOKEN")
    from_number = config("TWILIO_FROM_NUMBER")
    public_backend_url = config("PUBLIC_BACKEND_URL", default="").rstrip("/")

    if not public_backend_url:
        log.status = NotificationLog.Status.FAILED
        log.failure_reason = "PUBLIC_BACKEND_URL is not configured - cannot build a Twilio-reachable callback URL."
        log.save(update_fields=["status", "failure_reason", "updated_at"])

        raise NotificationError(
            "Voice calling isn't configured yet. Please contact support.",
            code="voice_not_configured",
        )

    try:
        client = Client(account_sid, auth_token)

        twiml_url = f"{public_backend_url}/api/notifications/voice/twiml/{log.pk}/"
        status_callback_url = f"{public_backend_url}/api/notifications/voice/status/{log.pk}/"

        call = client.calls.create(
            to=_format_e164(guest.mobile_number),
            from_=from_number,
            url=twiml_url,
            status_callback=status_callback_url,
            status_callback_event=["completed", "no-answer", "busy", "failed"],
            status_callback_method="POST",
        )

    except Exception as exc:
        log.status = NotificationLog.Status.FAILED
        log.failure_reason = str(exc)[:255]
        log.save(update_fields=["status", "failure_reason", "updated_at"])

        raise NotificationError(
            "Failed to place the call. Please try again.",
            code="voice_call_failed",
        )

    log.call_sid = call.sid
    log.save(update_fields=["call_sid", "updated_at"])

    return log


CHANNEL_HANDLERS = {
    "WHATSAPP": _send_via_whatsapp_one_click,
    "EMAIL": _send_via_email,
    "SMS": _send_via_sms,
    "VOICE_CALL": _send_via_voice_call,
}

RETRY_CHANNEL_HANDLERS = {
    "WHATSAPP": _send_via_whatsapp,
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
    message = _build_message_for_channel(invitation, channel)

    try:
        log = CHANNEL_HANDLERS[channel](invitation, message, organizer)

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
    """Update a voice call's log based on Twilio's status callback."""

    if call_status == "completed":
        log.status = NotificationLog.Status.SENT
        log.save(update_fields=["status", "updated_at"])

        guest = log.guest
        guest.invitation_status = guest.InvitationStatus.SENT
        guest.save(update_fields=["invitation_status", "updated_at"])

    elif call_status in ("no-answer", "busy", "failed"):
        log.status = NotificationLog.Status.FAILED
        log.failure_reason = f"Call ended: {call_status}"
        log.save(update_fields=["status", "failure_reason", "updated_at"])

    return log


def retry_notification(log: NotificationLog) -> NotificationLog:
    """Retry a failed or unconfirmed send by re-running the same channel handler."""

    handler = RETRY_CHANNEL_HANDLERS.get(log.channel)

    if handler is None:
        raise NotificationError(
            "Unknown channel, cannot retry.",
            code="invalid_channel",
        )

    message = _build_message_for_channel(log.invitation, log.channel)

    log.retry_count += 1
    log.save(update_fields=["retry_count", "updated_at"])

    return handler(log.invitation, message, log.invitation.event.organizer)


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

    for guest in batch:
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
    has_more = (not stopped) and total_matching > len(batch)

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

    if channel is None:
        channel = get_guest_last_channel(guest)

    return send_active_template_to_guest(
        event=event,
        guest=guest,
        organizer=organizer,
        channel=channel,
        is_reminder=True,
    )