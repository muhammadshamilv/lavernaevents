from decouple import config
from django.http import HttpResponse
from django.utils.html import strip_tags
from guests.models import Guest
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from .calendar import (
    build_event_ics,
    build_google_calendar_url,
    resolve_schedule,
)
from .serializers import InvitationPublicSerializer, SubmitResponseSerializer
from .services import (
    ResponseError,
    get_invitation_by_token,
    responses_open,
    submit_guest_response,
)

RESPONSE_ERROR_STATUS_MAP = {
    "invalid_token": status.HTTP_404_NOT_FOUND,
    "invalid_response_value": status.HTTP_400_BAD_REQUEST,
    "event_not_active": status.HTTP_409_CONFLICT,
}


def _error_response(error: ResponseError, field: str) -> Response:
    return Response(
        {
            "success": False,
            "message": error.message,
            "errors": {field: [error.message]},
        },
        status=RESPONSE_ERROR_STATUS_MAP.get(error.code, status.HTTP_400_BAD_REQUEST),
    )


def _public_base_url(request) -> str:
    """The address guests can actually reach this backend on.

    Behind Cloudflare Pages / Render, ``request.build_absolute_uri`` can
    return the internal host (or http instead of https), so
    PUBLIC_BACKEND_URL is preferred when it is set.
    """

    configured = config("PUBLIC_BACKEND_URL", default="").rstrip("/")

    if configured:
        return configured

    return request.build_absolute_uri("/").rstrip("/")


def _file_url(request, file_field) -> str | None:
    """Absolute URL of an uploaded file. Cloud storage (Supabase / S3)
    already returns a full https:// address; local storage returns a
    relative /media/... path."""

    if not file_field:
        return None

    url = file_field.url

    if url.startswith(("http://", "https://")):
        return url

    return f"{_public_base_url(request)}{url}"


def _safe_link(value: str) -> str:
    """The maps link is typed by the organizer; only http(s) links may
    reach the guest page (a javascript: link would run in their browser)."""

    value = (value or "").strip()

    return value if value.lower().startswith(("http://", "https://")) else ""


class InvitationResponsePageView(APIView):
    """Public endpoint: return invitation details for the guest response page.

    No authentication required -- this is the page a guest lands on
    after tapping their secure link. Access is controlled entirely by
    possession of the unguessable response_token, not a login.
    """

    permission_classes = [AllowAny]

    def get(self, request, response_token):
        """Return event and guest details needed to render the response page."""

        try:
            invitation = get_invitation_by_token(response_token)

        except ResponseError as error:
            return _error_response(error, "token")

        event = invitation.event
        guest = invitation.guest
        schedule = resolve_schedule(invitation)

        if event.event_type == event.EventType.CUSTOM and event.custom_event_type_label:
            event_type_label = event.custom_event_type_label
        else:
            event_type_label = event.get_event_type_display()

        data = {
            "guest_name": guest.name,
            "event_name": event.name,
            "event_type": event.event_type,
            "event_type_label": event_type_label,
            "host_name": event.host_name or getattr(event.organizer, "full_name", "") or "",
            "description": strip_tags(event.description or ""),
            "event_date": event.event_date,
            "event_time": schedule["start_time"],
            "event_end_time": schedule["end_time"],
            "time_text": schedule["time_text"],
            "venue_name": event.venue_name,
            "address": event.address,
            "google_maps_link": _safe_link(event.google_maps_link),
            "cover_image": _file_url(request, event.cover_image),
            "invitation_image": _file_url(request, invitation.image_file),
            "accent_color": schedule["accent_color"],
            "response_status": guest.response_status,
            "already_responded": guest.response_status != Guest.ResponseStatus.PENDING,
            "responses_open": responses_open(event),
            "is_cancelled": event.status == event.Status.CANCELLED,
            # .ics for Apple / Outlook (opens the "Add to Calendar" sheet).
            "calendar_url": f"{_public_base_url(request)}/api/respond/{response_token}/calendar/",
            # Google Calendar opens with everything filled in - one tap.
            "google_calendar_url": build_google_calendar_url(
                event, schedule["start_dt"], schedule["end_dt"]
            ),
        }

        serializer = InvitationPublicSerializer(data)

        response = Response(
            {
                "success": True,
                "message": "Invitation details retrieved successfully.",
                "data": serializer.data,
            },
            status=status.HTTP_200_OK,
        )
        # The page reflects live state (response, cancelled event) and the
        # URL itself is a secret - never let a shared cache keep it.
        response["Cache-Control"] = "no-store"

        return response

    def post(self, request, response_token):
        """Submit (or change) the guest's Accept/Reject/Maybe response."""

        serializer = SubmitResponseSerializer(data=request.data)

        if not serializer.is_valid():
            return Response(
                {
                    "success": False,
                    "message": "Invalid response.",
                    "errors": serializer.errors,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            guest = submit_guest_response(
                response_token=response_token,
                response_value=serializer.validated_data["response"],
            )

        except ResponseError as error:
            return _error_response(error, "response")

        response = Response(
            {
                "success": True,
                "message": "Thank you! Your response has been recorded.",
                "data": {
                    "response_status": guest.response_status,
                },
            },
            status=status.HTTP_200_OK,
        )
        response["Cache-Control"] = "no-store"

        return response


class InvitationCalendarView(APIView):
    """Public endpoint: download a .ics file for this guest's invited event.

    Same access model as InvitationResponsePageView - no authentication,
    access controlled by possession of the unguessable response_token.
    Deliberately GET-only and side-effect-free (does not touch
    response_status or any other guest/invitation state).
    """

    permission_classes = [AllowAny]

    def get(self, request, response_token):
        try:
            invitation = get_invitation_by_token(response_token)

        except ResponseError as error:
            return _error_response(error, "token")

        event = invitation.event

        # A calendar entry for an event that was called off would mislead.
        if event.status == event.Status.CANCELLED:
            return _error_response(
                ResponseError("This event has been cancelled.", code="event_not_active"),
                "token",
            )

        schedule = resolve_schedule(invitation)

        ics_bytes = build_event_ics(
            event,
            invitation.guest,
            start_dt=schedule["start_dt"],
            end_dt=schedule["end_dt"],
        )

        response = HttpResponse(ics_bytes, content_type="text/calendar; charset=utf-8")
        safe_name = "".join(
            ch for ch in event.name if ch.isalnum() or ch in (" ", "-", "_")
        ).strip() or "event"

        # "inline" lets phones open the native "Add to Calendar" sheet
        # straight away; ?download=1 forces a file download instead.
        disposition = "attachment" if request.query_params.get("download") else "inline"
        response["Content-Disposition"] = f'{disposition}; filename="{safe_name}.ics"'
        response["Cache-Control"] = "no-store"

        return response