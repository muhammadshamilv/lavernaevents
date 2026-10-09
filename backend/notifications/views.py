from common.permissions import IsOrganizer
from events.models import Event
from guests.models import Guest
from django.conf import settings
from django.http import HttpResponse
from invitations.services import InvitationError
from rest_framework import status
from rest_framework.generics import ListAPIView
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import NotificationLog
from .serializers import (
    NotificationLogSerializer,
    SendActiveTemplateSerializer,
    SendBulkInvitationsSerializer,
)
from .services import (
    NotificationError,
    apply_voice_call_status_callback,
    build_voice_message,
    get_voice_settings,
    mark_whatsapp_as_sent,
    retry_notification,
    send_active_template_to_guest,
    send_bulk_invitations,
    send_reminder_to_guest,
)

ERROR_STATUS_MAP = {
    "template_not_found": status.HTTP_404_NOT_FOUND,
    "template_missing_body": status.HTTP_400_BAD_REQUEST,
    "invalid_placeholder": status.HTTP_400_BAD_REQUEST,
    "no_active_plan": status.HTTP_402_PAYMENT_REQUIRED,
    "template_limit_exceeded": status.HTTP_409_CONFLICT,
    "render_failed": status.HTTP_500_INTERNAL_SERVER_ERROR,
    "missing_email": status.HTTP_400_BAD_REQUEST,
    "email_send_failed": status.HTTP_502_BAD_GATEWAY,
    "sms_send_failed": status.HTTP_502_BAD_GATEWAY,
    "sms_not_configured": status.HTTP_503_SERVICE_UNAVAILABLE,
    "invalid_channel": status.HTTP_400_BAD_REQUEST,
    "bulk_not_supported": status.HTTP_400_BAD_REQUEST,
    "no_active_template": status.HTTP_409_CONFLICT,
    "active_template_wrong_event": status.HTTP_409_CONFLICT,
    "voice_not_configured": status.HTTP_503_SERVICE_UNAVAILABLE,
    "voice_call_failed": status.HTTP_502_BAD_GATEWAY,
    "voice_call_limit_exceeded": status.HTTP_409_CONFLICT,
    "voice_call_not_available": status.HTTP_409_CONFLICT,
    "invitation_limit_exceeded": status.HTTP_409_CONFLICT,
    "platform_pool_exhausted": status.HTTP_503_SERVICE_UNAVAILABLE,
    "event_not_active": status.HTTP_409_CONFLICT,
    "not_retryable": status.HTTP_409_CONFLICT,
    "guest_already_responded": status.HTTP_409_CONFLICT,
    "no_previous_invitation": status.HTTP_409_CONFLICT,
    "sms_international_unsupported": status.HTTP_400_BAD_REQUEST,
}


def get_owned_event_or_none(pk: int, user) -> Event | None:
    """Return the event only if it exists and belongs to the requesting user."""

    return Event.objects.filter(pk=pk, organizer=user).first()


def _event_not_found_response() -> Response:
    return Response(
        {
            "success": False,
            "message": "Event not found.",
            "errors": {"event": ["No event found with this ID."]},
        },
        status=status.HTTP_404_NOT_FOUND,
    )


def _guest_not_found_response() -> Response:
    return Response(
        {
            "success": False,
            "message": "Guest not found on this event.",
            "errors": {"guest_id": ["No guest found with this ID on this event."]},
        },
        status=status.HTTP_404_NOT_FOUND,
    )


def _send_error_response(error, key: str = "invitation") -> Response:
    return Response(
        {
            "success": False,
            "message": error.message,
            "errors": {key: [error.message]},
        },
        status=ERROR_STATUS_MAP.get(error.code, status.HTTP_400_BAD_REQUEST),
    )


class SendInvitationView(APIView):
    """The Guests page's single-guest Send action.

    The organizer picks the channel on the Guests page before sending;
    it arrives here as `channel` along with `guest_id`. The template
    itself is always the organizer's one active filled template.
    """

    permission_classes = [IsAuthenticated, IsOrganizer]

    def post(self, request, event_pk):
        event = get_owned_event_or_none(event_pk, request.user)

        if event is None:
            return _event_not_found_response()

        serializer = SendActiveTemplateSerializer(data=request.data)

        if not serializer.is_valid():
            return Response(
                {
                    "success": False,
                    "message": "Invalid request.",
                    "errors": serializer.errors,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        guest = Guest.objects.filter(
            pk=serializer.validated_data["guest_id"],
            event=event,
        ).first()

        if guest is None:
            return _guest_not_found_response()

        try:
            log = send_active_template_to_guest(
                event=event,
                guest=guest,
                organizer=request.user,
                channel=serializer.validated_data.get("channel"),
            )

        except (InvitationError, NotificationError) as error:
            return _send_error_response(error)

        response_serializer = NotificationLogSerializer(log)

        if log.channel == NotificationLog.Channel.WHATSAPP:
            message = "WhatsApp invitation ready."
        elif log.channel == NotificationLog.Channel.VOICE_CALL:
            message = "Call initiated - the guest's phone is ringing."
        else:
            message = f"Invitation sent successfully via {log.get_channel_display()}."

        return Response(
            {
                "success": True,
                "message": message,
                "data": response_serializer.data,
            },
            status=status.HTTP_201_CREATED,
        )


class SendBulkInvitationsView(APIView):
    """Send ONE BATCH of a bulk Email / SMS / Voice Call send.

    The frontend calls this repeatedly, feeding back `next_after_id`
    until `has_more` is false, which gives live progress and keeps each
    request short. WhatsApp is deliberately not available here.
    """

    permission_classes = [IsAuthenticated, IsOrganizer]

    def post(self, request, event_pk):
        event = get_owned_event_or_none(event_pk, request.user)

        if event is None:
            return _event_not_found_response()

        serializer = SendBulkInvitationsSerializer(data=request.data)

        if not serializer.is_valid():
            return Response(
                {
                    "success": False,
                    "message": "Invalid request.",
                    "errors": serializer.errors,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        data = serializer.validated_data

        try:
            result = send_bulk_invitations(
                event=event,
                organizer=request.user,
                channel=data["channel"],
                guest_ids=data["guest_ids"],
                category_ids=data["category_ids"],
                include_uncategorized=data["include_uncategorized"],
                select_all=data["select_all"],
                skip_already_sent=data["skip_already_sent"],
                after_id=data["after_id"],
                batch_size=data["batch_size"],
            )

        except (InvitationError, NotificationError) as error:
            return _send_error_response(error)

        return Response(
            {
                "success": True,
                "message": "Batch processed.",
                "data": result,
            },
            status=status.HTTP_200_OK,
        )


class MarkWhatsAppSentView(APIView):
    """Confirm that the organizer sent the WhatsApp message (retry path only)."""

    permission_classes = [IsAuthenticated, IsOrganizer]

    def post(self, request, log_pk):
        log = NotificationLog.objects.filter(
            pk=log_pk,
            invitation__event__organizer=request.user,
            channel=NotificationLog.Channel.WHATSAPP,
        ).first()

        if log is None:
            return Response(
                {
                    "success": False,
                    "message": "WhatsApp log not found.",
                    "errors": {"log": ["No WhatsApp log found with this ID."]},
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        updated_log = mark_whatsapp_as_sent(log)

        serializer = NotificationLogSerializer(updated_log)

        return Response(
            {
                "success": True,
                "message": "Marked as sent.",
                "data": serializer.data,
            },
            status=status.HTTP_200_OK,
        )


class RetryNotificationView(APIView):
    """Retry a failed or unconfirmed notification send."""

    permission_classes = [IsAuthenticated, IsOrganizer]

    def post(self, request, log_pk):
        log = NotificationLog.objects.filter(
            pk=log_pk,
            invitation__event__organizer=request.user,
        ).first()

        if log is None:
            return Response(
                {
                    "success": False,
                    "message": "Notification log not found.",
                    "errors": {"log": ["No log found with this ID."]},
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        try:
            updated_log = retry_notification(log, request.user)

        except (InvitationError, NotificationError) as error:
            return _send_error_response(error, key="notification")

        serializer = NotificationLogSerializer(updated_log)

        return Response(
            {
                "success": True,
                "message": "Retry completed.",
                "data": serializer.data,
            },
            status=status.HTTP_200_OK,
        )


class EventNotificationLogListView(ListAPIView):
    """List notification send logs for an event (status table for the guest list UI)."""

    serializer_class = NotificationLogSerializer
    permission_classes = [IsAuthenticated, IsOrganizer]

    def get_queryset(self):
        return NotificationLog.objects.filter(
            invitation__event__pk=self.kwargs["event_pk"],
            invitation__event__organizer=self.request.user,
        ).select_related("guest", "invitation__template")

    def list(self, request, *args, **kwargs):
        # Someone else's (or a missing) event is a 404, like every other
        # event-scoped endpoint - not an empty 200 that hides the difference.
        if get_owned_event_or_none(self.kwargs["event_pk"], request.user) is None:
            return _event_not_found_response()

        queryset = self.get_queryset()

        page = self.paginate_queryset(queryset)

        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)

        serializer = self.get_serializer(queryset, many=True)

        return Response(
            {
                "success": True,
                "message": "Notification logs retrieved successfully.",
                "data": serializer.data,
            },
            status=status.HTTP_200_OK,
        )


# ---------------------------------------------------------------------
# Twilio webhooks (called BY Twilio, not by our frontend)
# ---------------------------------------------------------------------
#
# No cookie / JWT is possible here, so both views are AllowAny. They are
# protected by checking Twilio's X-Twilio-Signature header against
# TWILIO_AUTH_TOKEN, so only Twilio can read a call's script or report its
# result. Set TWILIO_VALIDATE_SIGNATURE=False only for local experiments.

def _twilio_request_is_genuine(request) -> bool:
    from decouple import config

    if not config("TWILIO_VALIDATE_SIGNATURE", default=True, cast=bool):
        return True

    auth_token = config("TWILIO_AUTH_TOKEN", default="")

    if not auth_token:
        return False

    from twilio.request_validator import RequestValidator

    # Twilio signed the PUBLIC url it called, which behind a proxy is not
    # the url Django sees - so rebuild it from PUBLIC_BACKEND_URL.
    public_base = (getattr(settings, "PUBLIC_BACKEND_URL", "") or "").rstrip("/")
    url = f"{public_base}{request.path}" if public_base else request.build_absolute_uri()

    if request.META.get("QUERY_STRING"):
        url = f"{url}?{request.META['QUERY_STRING']}"

    params = {key: value for key, value in request.POST.items()}
    signature = request.META.get("HTTP_X_TWILIO_SIGNATURE", "")

    return RequestValidator(auth_token).validate(url, params, signature)


def _twiml_response(inner: str, http_status: int = status.HTTP_200_OK) -> HttpResponse:
    return HttpResponse(
        f'<?xml version="1.0" encoding="UTF-8"?><Response>{inner}</Response>',
        content_type="text/xml",
        status=http_status,
    )


class VoiceTwiMLView(APIView):
    """Return the TwiML Twilio fetches when a voice call connects."""

    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request, log_pk):
        if not _twilio_request_is_genuine(request):
            return HttpResponse("Forbidden", status=status.HTTP_403_FORBIDDEN)

        log = NotificationLog.objects.filter(
            pk=log_pk,
            channel=NotificationLog.Channel.VOICE_CALL,
        ).select_related("invitation", "invitation__event", "invitation__guest").first()

        if log is None:
            return _twiml_response("<Say>Invitation not found.</Say>", status.HTTP_404_NOT_FOUND)

        message = build_voice_message(log.invitation)

        # Voice name + language come from VOICE_CALL_LANGUAGE ("en" / "ml").
        voice, language = get_voice_settings()

        escaped_message = (
            message.replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
            .replace('"', "&quot;")
            .replace("'", "&apos;")
        )

        return _twiml_response(f'<Say voice="{voice}" language="{language}">{escaped_message}</Say>')


class TwilioCallStatusCallbackView(APIView):
    """Receive Twilio's final call status and update the NotificationLog."""

    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request, log_pk):
        if not _twilio_request_is_genuine(request):
            return HttpResponse("Forbidden", status=status.HTTP_403_FORBIDDEN)

        log = NotificationLog.objects.filter(
            pk=log_pk,
            channel=NotificationLog.Channel.VOICE_CALL,
        ).select_related("guest").first()

        if log is None:
            return Response(status=status.HTTP_404_NOT_FOUND)

        call_status = request.data.get("CallStatus", "")

        apply_voice_call_status_callback(log, call_status)

        return Response(status=status.HTTP_200_OK)


# ---------------------------------------------------------------------
# Reminders
# ---------------------------------------------------------------------

class SendReminderView(APIView):
    """Manually trigger a reminder send right now (Email/SMS/Voice Call -
    WhatsApp goes through SendPendingWhatsAppReminderView instead).

    Without an explicit `channel`, the reminder uses the channel this
    guest's invitation last went out on.
    """

    permission_classes = [IsAuthenticated, IsOrganizer]

    def post(self, request, event_pk):
        event = get_owned_event_or_none(event_pk, request.user)

        if event is None:
            return _event_not_found_response()

        serializer = SendActiveTemplateSerializer(data=request.data)

        if not serializer.is_valid():
            return Response(
                {
                    "success": False,
                    "message": "Invalid request.",
                    "errors": serializer.errors,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        guest = Guest.objects.filter(
            pk=serializer.validated_data["guest_id"],
            event=event,
        ).first()

        if guest is None:
            return _guest_not_found_response()

        try:
            log = send_reminder_to_guest(
                event=event,
                guest=guest,
                organizer=request.user,
                channel=serializer.validated_data.get("channel"),
            )

        except (InvitationError, NotificationError) as error:
            return _send_error_response(error)

        response_serializer = NotificationLogSerializer(log)

        return Response(
            {
                "success": True,
                "message": "Reminder sent.",
                "data": response_serializer.data,
            },
            status=status.HTTP_201_CREATED,
        )


class SendPendingWhatsAppReminderView(APIView):
    """One-click send a queued WhatsApp reminder, then clear it from the
    pending list."""

    permission_classes = [IsAuthenticated, IsOrganizer]

    def post(self, request, pending_pk):
        from invitations.models import PendingWhatsAppReminder

        pending = PendingWhatsAppReminder.objects.filter(
            pk=pending_pk,
            event__organizer=request.user,
        ).select_related("event", "guest").first()

        if pending is None:
            return Response(
                {
                    "success": False,
                    "message": "Pending reminder not found.",
                    "errors": {"reminder": ["No pending reminder found with this ID."]},
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        try:
            log = send_reminder_to_guest(
                event=pending.event,
                guest=pending.guest,
                organizer=request.user,
                channel=NotificationLog.Channel.WHATSAPP,
            )

        except (InvitationError, NotificationError) as error:
            # A reminder that can never be sent (guest already replied, event
            # closed) would otherwise sit in the list forever.
            if error.code in ("guest_already_responded", "no_previous_invitation", "event_not_active"):
                pending.delete()

            return _send_error_response(error)

        pending.delete()

        response_serializer = NotificationLogSerializer(log)

        return Response(
            {
                "success": True,
                "message": "Reminder sent via WhatsApp.",
                "data": response_serializer.data,
            },
            status=status.HTTP_201_CREATED,
        )