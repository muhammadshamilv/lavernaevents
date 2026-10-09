from common.permissions import IsOrganizer
from events.models import Event
from guests.models import Guest
from memberships.services import get_organizer_template_count
from memberships.utils import get_effective_plan
from rest_framework import status
from rest_framework.generics import ListAPIView
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from django.http import HttpResponse

from .report_pdf import render_report_pdf
from .reports import build_full_report

from .models import Invitation, InvitationTemplate, PendingWhatsAppReminder, ReminderSchedule
from .serializers import (
    ActiveFilledTemplateSerializer,
    CustomTemplateSerializer,
    CustomTemplateUploadSerializer,
    FillActiveTemplateSerializer,
    InvitationPreviewResultSerializer,
    InvitationSerializer,
    InvitationTemplateSerializer,
    PreviewInvitationSerializer,
    PendingWhatsAppReminderSerializer,
    ReminderScheduleSerializer
)
from .services import (
    InvitationError,
    build_placeholder_context,
    delete_custom_template,
    deselect_active_template,
    fill_active_template,
    get_active_filled_template,
    preview_template,
    upload_custom_template,
    upsert_reminder_schedule,
    visible_templates_for,
)

PREVIEW_ERROR_STATUS_MAP = {
    "invalid_placeholder": status.HTTP_400_BAD_REQUEST,
}

DELETE_ERROR_STATUS_MAP = {
    "template_not_found": status.HTTP_404_NOT_FOUND,
}

UPLOAD_ERROR_STATUS_MAP = {
    "no_active_plan": status.HTTP_402_PAYMENT_REQUIRED,
    "template_limit_exceeded": status.HTTP_409_CONFLICT,
}

FILL_ERROR_STATUS_MAP = {
    "template_not_found": status.HTTP_404_NOT_FOUND,
    "event_not_found": status.HTTP_404_NOT_FOUND,
    "template_missing_body": status.HTTP_400_BAD_REQUEST,
    "no_active_plan": status.HTTP_402_PAYMENT_REQUIRED,
    "template_limit_exceeded": status.HTTP_409_CONFLICT,
    "missing_custom_field": status.HTTP_400_BAD_REQUEST,
    "invalid_placeholder": status.HTTP_400_BAD_REQUEST,
}


class InvitationTemplateListView(ListAPIView):
    """List invitation templates available for the requesting organizer to browse and pick."""

    serializer_class = InvitationTemplateSerializer
    permission_classes = [IsAuthenticated, IsOrganizer]
    pagination_class = None

    def get_queryset(self):
        return (
            visible_templates_for(self.request.user)
            .prefetch_related("custom_fields")
            .order_by("display_order", "name")
        )

    def list(self, request, *args, **kwargs):
        queryset = self.get_queryset()
        serializer = self.get_serializer(queryset, many=True)

        plan = get_effective_plan(request.user)
        template_count = get_organizer_template_count(request.user)

        return Response(
            {
                "success": True,
                "message": "Invitation templates retrieved successfully.",
                "data": serializer.data,
                "meta": {
                    "template_limit": plan.template_limit if plan else None,
                    "template_count": template_count,
                },
            },
            status=status.HTTP_200_OK,
        )


class CustomTemplateUploadView(APIView):
    """Upload a new custom invitation template into the organizer's own library."""

    permission_classes = [IsAuthenticated, IsOrganizer]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        import json

        # A plain dict (not request.data.copy()): copying a multipart
        # QueryDict deep-copies the uploaded files, which fails for files
        # large enough to be spooled to disk.
        data = {key: request.data.get(key) for key in request.data.keys()}

        # custom_fields arrives as a JSON-encoded string inside the
        # multipart body (multipart/form-data cannot carry nested JSON
        # natively) - decode it before validation.
        raw_custom_fields = data.get("custom_fields")

        if isinstance(raw_custom_fields, str):
            if raw_custom_fields.strip():
                try:
                    decoded = json.loads(raw_custom_fields)
                except ValueError:
                    decoded = None

                if not isinstance(decoded, list):
                    return Response(
                        {
                            "success": False,
                            "message": "Template upload failed.",
                            "errors": {"custom_fields": ["Must be a JSON list."]},
                        },
                        status=status.HTTP_400_BAD_REQUEST,
                    )

                data["custom_fields"] = decoded
            else:
                data.pop("custom_fields")

        serializer = CustomTemplateUploadSerializer(data=data)

        if not serializer.is_valid():
            return Response(
                {
                    "success": False,
                    "message": "Template upload failed.",
                    "errors": serializer.errors,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            template = upload_custom_template(
                organizer=request.user,
                validated_data=serializer.validated_data,
            )

        except InvitationError as error:
            response_status = UPLOAD_ERROR_STATUS_MAP.get(
                error.code,
                status.HTTP_400_BAD_REQUEST,
            )

            return Response(
                {
                    "success": False,
                    "message": error.message,
                    "errors": {"template": [error.message]},
                },
                status=response_status,
            )

        response_serializer = CustomTemplateSerializer(template, context={"request": request})

        return Response(
            {
                "success": True,
                "message": "Template uploaded successfully.",
                "data": response_serializer.data,
            },
            status=status.HTTP_201_CREATED,
        )


class CustomTemplateDeleteView(APIView):
    """Remove one of the organizer's own uploaded templates (frees a slot)."""

    permission_classes = [IsAuthenticated, IsOrganizer]

    def delete(self, request, template_pk):
        try:
            outcome = delete_custom_template(request.user, template_pk)

        except InvitationError as error:
            return Response(
                {
                    "success": False,
                    "message": error.message,
                    "errors": {"template": [error.message]},
                },
                status=DELETE_ERROR_STATUS_MAP.get(error.code, status.HTTP_400_BAD_REQUEST),
            )

        return Response(
            {
                "success": True,
                "message": "Template removed.",
                "data": {"outcome": outcome},
            },
            status=status.HTTP_200_OK,
        )


class MyCustomTemplateListView(ListAPIView):
    """List only the requesting organizer's own custom templates (their uploads)."""

    serializer_class = CustomTemplateSerializer
    permission_classes = [IsAuthenticated, IsOrganizer]
    pagination_class = None

    def get_queryset(self):
        return InvitationTemplate.objects.filter(
            owner=self.request.user,
            is_custom=True,
        ).prefetch_related("custom_fields").order_by("-created_at")

    def list(self, request, *args, **kwargs):
        queryset = self.get_queryset()
        serializer = self.get_serializer(queryset, many=True)

        return Response(
            {
                "success": True,
                "message": "Your custom templates retrieved successfully.",
                "data": serializer.data,
            },
            status=status.HTTP_200_OK,
        )


def get_owned_event_or_none(pk: int, user) -> Event | None:
    """Return the event only if it exists and belongs to the requesting user."""

    return Event.objects.filter(pk=pk, organizer=user).first()


class InvitationPreviewView(APIView):
    """Legacy preview endpoint: render a template for a specific guest, before
    selecting it as the active template. Still useful for a quick look at a
    platform template's standard-field rendering in the Template Gallery."""

    permission_classes = [IsAuthenticated, IsOrganizer]

    def post(self, request, event_pk):
        event = get_owned_event_or_none(event_pk, request.user)

        if event is None:
            return Response(
                {
                    "success": False,
                    "message": "Event not found.",
                    "errors": {"event": ["No event found with this ID."]},
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        serializer = PreviewInvitationSerializer(data=request.data)

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
            return Response(
                {
                    "success": False,
                    "message": "Guest not found.",
                    "errors": {"guest_id": ["No guest found with this ID on this event."]},
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        template = visible_templates_for(request.user).filter(
            pk=serializer.validated_data["template_id"],
        ).first()

        if template is None:
            return Response(
                {
                    "success": False,
                    "message": "Template not found.",
                    "errors": {"template_id": ["No active template found with this ID."]},
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        try:
            preview = preview_template(template, event, guest)

        except InvitationError as error:
            response_status = PREVIEW_ERROR_STATUS_MAP.get(
                error.code,
                status.HTTP_400_BAD_REQUEST,
            )

            return Response(
                {
                    "success": False,
                    "message": error.message,
                    "errors": {"template_id": [error.message]},
                },
                status=response_status,
            )

        response_serializer = InvitationPreviewResultSerializer(preview)

        return Response(
            {
                "success": True,
                "message": "Preview generated successfully.",
                "data": response_serializer.data,
            },
            status=status.HTTP_200_OK,
        )


class EventStandardFieldDefaultsView(APIView):
    """Return the standard placeholder defaults for a specific event.

    Phase 20. Powers the Templates page's "pick an event" step: once the
    organizer picks which event the template is for, the fill-in form
    needs to pre-populate event_name/event_date/venue_name/etc. before
    the organizer edits and confirms them.
    """

    permission_classes = [IsAuthenticated, IsOrganizer]

    def get(self, request, event_pk):
        event = get_owned_event_or_none(event_pk, request.user)

        if event is None:
            return Response(
                {
                    "success": False,
                    "message": "Event not found.",
                    "errors": {"event": ["No event found with this ID."]},
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        defaults = build_placeholder_context(event, guest=None)
        defaults.pop("guest_name", None)

        return Response(
            {
                "success": True,
                "message": "Event defaults retrieved successfully.",
                "data": defaults,
            },
            status=status.HTTP_200_OK,
        )


class ActiveFilledTemplateView(APIView):
    """GET the organizer's currently active filled template (or null),
    POST to select+fill+confirm a new one (replacing any existing one),
    DELETE to deselect (reset to background-only state).

    Phase 20. This is the single endpoint backing the Templates page's
    entire select -> pick event -> fill -> confirm -> deselect cycle.
    """

    permission_classes = [IsAuthenticated, IsOrganizer]

    def get(self, request):
        active = get_active_filled_template(request.user)

        data = ActiveFilledTemplateSerializer(active).data if active is not None else None

        return Response(
            {
                "success": True,
                "message": "Active template retrieved successfully.",
                "data": data,
            },
            status=status.HTTP_200_OK,
        )

    def post(self, request):
        serializer = FillActiveTemplateSerializer(data=request.data)

        if not serializer.is_valid():
            return Response(
                {
                    "success": False,
                    "message": "Invalid request.",
                    "errors": serializer.errors,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            active = fill_active_template(
                organizer=request.user,
                template_id=serializer.validated_data["template_id"],
                event_id=serializer.validated_data["event_id"],
                standard_values=serializer.validated_data.get("standard_values", {}),
                custom_values=serializer.validated_data.get("custom_values", {}),
            )

        except InvitationError as error:
            response_status = FILL_ERROR_STATUS_MAP.get(
                error.code,
                status.HTTP_400_BAD_REQUEST,
            )

            return Response(
                {
                    "success": False,
                    "message": error.message,
                    "errors": {"template": [error.message]},
                },
                status=response_status,
            )

        response_serializer = ActiveFilledTemplateSerializer(active)

        return Response(
            {
                "success": True,
                "message": "Template filled and set as active.",
                "data": response_serializer.data,
            },
            status=status.HTTP_200_OK,
        )

    def delete(self, request):
        deselect_active_template(request.user)

        return Response(
            {
                "success": True,
                "message": "Active template deselected.",
                "data": None,
            },
            status=status.HTTP_200_OK,
        )


class EventInvitationListView(ListAPIView):
    """List all invitations generated for a specific event (invitation history)."""

    serializer_class = InvitationSerializer
    permission_classes = [IsAuthenticated, IsOrganizer]

    def get_queryset(self):
        return Invitation.objects.filter(
            event__pk=self.kwargs["event_pk"],
            event__organizer=self.request.user,
        )

    def list(self, request, *args, **kwargs):
        event = get_owned_event_or_none(kwargs["event_pk"], request.user)

        if event is None:
            return Response(
                {
                    "success": False,
                    "message": "Event not found.",
                    "errors": {"event": ["No event found with this ID."]},
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        queryset = self.get_queryset()

        page = self.paginate_queryset(queryset)

        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)

        serializer = self.get_serializer(queryset, many=True)

        return Response(
            {
                "success": True,
                "message": "Invitation history retrieved successfully.",
                "data": serializer.data,
            },
            status=status.HTTP_200_OK,
        )
        
class ReminderScheduleListCreateView(APIView):
    """List an event's active reminder schedules, or set a new one.

    Phase 22. POSTing replaces any existing active schedule for the same
    category/guest (see services.upsert_reminder_schedule) rather than
    requiring a separate delete-then-create.
    """

    permission_classes = [IsAuthenticated, IsOrganizer]

    def get(self, request, event_pk):
        event = get_owned_event_or_none(event_pk, request.user)

        if event is None:
            return Response(
                {
                    "success": False,
                    "message": "Event not found.",
                    "errors": {"event": ["No event found with this ID."]},
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        schedules = ReminderSchedule.objects.filter(event=event, is_active=True).select_related(
            "category", "guest"
        )

        serializer = ReminderScheduleSerializer(schedules, many=True)

        return Response(
            {
                "success": True,
                "message": "Reminder schedules retrieved successfully.",
                "data": serializer.data,
            },
            status=status.HTTP_200_OK,
        )

    def post(self, request, event_pk):
        event = get_owned_event_or_none(event_pk, request.user)

        if event is None:
            return Response(
                {
                    "success": False,
                    "message": "Event not found.",
                    "errors": {"event": ["No event found with this ID."]},
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        serializer = ReminderScheduleSerializer(data=request.data)

        if not serializer.is_valid():
            return Response(
                {
                    "success": False,
                    "message": "Invalid request.",
                    "errors": serializer.errors,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        category = serializer.validated_data.get("category")
        guest = serializer.validated_data.get("guest")

        # Confirm the category/guest actually belongs to this event - the
        # serializer's PrimaryKeyRelatedField only confirms it exists
        # SOMEWHERE, not that it's scoped correctly (same pattern as
        # GuestSerializer.validate_category and the contact-import view).
        if category is not None and category.event_id != event.id:
            return Response(
                {
                    "success": False,
                    "message": "Invalid request.",
                    "errors": {"category": ["This category does not belong to this event."]},
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        if guest is not None and guest.event_id != event.id:
            return Response(
                {
                    "success": False,
                    "message": "Invalid request.",
                    "errors": {"guest": ["This guest does not belong to this event."]},
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        schedule = upsert_reminder_schedule(
            event=event,
            delay_hours=serializer.validated_data["delay_hours"],
            category=category,
            guest=guest,
        )

        response_serializer = ReminderScheduleSerializer(schedule)

        return Response(
            {
                "success": True,
                "message": "Reminder schedule saved.",
                "data": response_serializer.data,
            },
            status=status.HTTP_201_CREATED,
        )


class ReminderScheduleDetailView(APIView):
    """Deactivate (turn off) a reminder schedule."""

    permission_classes = [IsAuthenticated, IsOrganizer]

    def delete(self, request, event_pk, schedule_pk):
        schedule = ReminderSchedule.objects.filter(
            pk=schedule_pk,
            event__pk=event_pk,
            event__organizer=request.user,
        ).first()

        if schedule is None:
            return Response(
                {
                    "success": False,
                    "message": "Reminder schedule not found.",
                    "errors": {"schedule": ["No schedule found with this ID."]},
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        schedule.is_active = False
        schedule.save(update_fields=["is_active", "updated_at"])

        return Response(
            {
                "success": True,
                "message": "Reminder schedule turned off.",
                "data": None,
            },
            status=status.HTTP_200_OK,
        )


class PendingWhatsAppReminderListView(ListAPIView):
    """List this organizer's WhatsApp reminders that are due and waiting
    for a manual one-click send (see notifications app for the send
    action itself, which deletes the row on success)."""

    serializer_class = PendingWhatsAppReminderSerializer
    permission_classes = [IsAuthenticated, IsOrganizer]
    pagination_class = None

    def get_queryset(self):
        return PendingWhatsAppReminder.objects.filter(
            event__organizer=self.request.user
        ).select_related("guest", "event")

    def list(self, request, *args, **kwargs):
        queryset = self.get_queryset()
        serializer = self.get_serializer(queryset, many=True)

        return Response(
            {
                "success": True,
                "message": "Pending WhatsApp reminders retrieved successfully.",
                "data": serializer.data,
            },
            status=status.HTTP_200_OK,
        )
        
        
class InvitationReportView(APIView):
    """Return the full Phase 24 invitation report (JSON) for one event.

    Organizer-only, scoped to events they own - same ownership pattern as
    the rest of this app's event-scoped views.
    """

    permission_classes = [IsAuthenticated, IsOrganizer]

    def get(self, request, event_id):
        from events.models import Event

        event = Event.objects.filter(pk=event_id, organizer=request.user).first()

        if event is None:
            return Response(
                {
                    "success": False,
                    "message": "Event not found.",
                    "errors": {"event": ["No event found with this ID."]},
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        report = build_full_report(event)

        return Response(
            {
                "success": True,
                "message": "Report generated successfully.",
                "data": report,
            },
            status=status.HTTP_200_OK,
        )


class InvitationReportPdfView(APIView):
    """Download the Phase 24 invitation report as a PDF for one event."""

    permission_classes = [IsAuthenticated, IsOrganizer]

    def get(self, request, event_id):
        from events.models import Event

        event = Event.objects.filter(pk=event_id, organizer=request.user).first()

        if event is None:
            return Response(
                {
                    "success": False,
                    "message": "Event not found.",
                    "errors": {"event": ["No event found with this ID."]},
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        report = build_full_report(event)
        pdf_bytes = render_report_pdf(report)

        response = HttpResponse(pdf_bytes, content_type="application/pdf")
        safe_name = "".join(
            ch for ch in event.name if ch.isalnum() or ch in (" ", "-", "_")
        ).strip() or "event"
        response["Content-Disposition"] = f'attachment; filename="{safe_name}-invitation-report.pdf"'

        return response
