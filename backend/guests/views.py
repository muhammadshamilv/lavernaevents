import re

from common.permissions import IsOrganizer
from django.db.models import Count, Q
from django.http import HttpResponse
from events.models import Event
from rest_framework import status
from rest_framework.generics import ListAPIView
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Guest, GuestCategory
from .serializers import (
    ContactImportRequestSerializer,
    ContactImportResultSerializer,
    CSVImportResultSerializer,
    GuestCategorySerializer,
    GuestSerializer,
)
from .services import (
    GuestError,
    bulk_import_guests,
    create_category,
    create_guest,
    delete_category,
    delete_guest,
    export_guests_to_csv,
    import_guests_from_csv,
    update_category,
    update_guest,
)

GUEST_ERROR_STATUS_MAP = {
    "guest_limit_exceeded": status.HTTP_409_CONFLICT,
    "no_active_plan": status.HTTP_402_PAYMENT_REQUIRED,
    "duplicate_guest": status.HTTP_409_CONFLICT,
    "file_too_large": status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
}

CATEGORY_ERROR_STATUS_MAP = {
    "duplicate_category": status.HTTP_409_CONFLICT,
    "category_limit": status.HTTP_409_CONFLICT,
}


def get_owned_event_or_none(pk: int, user) -> Event | None:
    """Return the event only if it exists and belongs to the requesting user."""

    return Event.objects.filter(pk=pk, organizer=user).first()


def event_not_found() -> Response:
    return Response(
        {
            "success": False,
            "message": "Event not found.",
            "errors": {"event": ["No event found with this ID."]},
        },
        status=status.HTTP_404_NOT_FOUND,
    )


def guest_not_found() -> Response:
    return Response(
        {
            "success": False,
            "message": "Guest not found.",
            "errors": {"guest": ["No guest found with this ID."]},
        },
        status=status.HTTP_404_NOT_FOUND,
    )


def category_not_found() -> Response:
    return Response(
        {
            "success": False,
            "message": "Category not found.",
            "errors": {"category": ["No category found with this ID."]},
        },
        status=status.HTTP_404_NOT_FOUND,
    )


def validation_failed(message: str, errors) -> Response:
    return Response(
        {"success": False, "message": message, "errors": errors},
        status=status.HTTP_400_BAD_REQUEST,
    )


def service_error(error: GuestError, status_map: dict, field: str) -> Response:
    return Response(
        {
            "success": False,
            "message": error.message,
            "errors": {field: [error.message]},
        },
        status=status_map.get(error.code, status.HTTP_400_BAD_REQUEST),
    )


class GuestListCreateView(ListAPIView):
    """List guests for an event, or add a new guest to it.

    GET query params (all optional):
      search=<text>                 name / mobile / email
      response_status=PENDING|ACCEPTED|REJECTED|MAYBE
      invitation_status=NOT_SENT|SENT|FAILED
      category=<id> | uncategorized
      page, page_size
    """

    serializer_class = GuestSerializer
    permission_classes = [IsAuthenticated, IsOrganizer]

    def get_queryset(self):
        """Guests of the event, scoped to the requesting organizer."""

        queryset = (
            Guest.objects.filter(
                event__pk=self.kwargs["event_pk"],
                event__organizer=self.request.user,
            )
            .select_related("category")
            .prefetch_related("notification_logs")
        )

        params = self.request.query_params

        response_status = (params.get("response_status") or "").upper()
        if response_status in Guest.ResponseStatus.values:
            queryset = queryset.filter(response_status=response_status)

        invitation_status = (params.get("invitation_status") or "").upper()
        if invitation_status in Guest.InvitationStatus.values:
            queryset = queryset.filter(invitation_status=invitation_status)

        category = (params.get("category") or "").strip().lower()
        if category == "uncategorized":
            queryset = queryset.filter(category__isnull=True)
        elif category.isdigit():
            queryset = queryset.filter(category_id=int(category))

        search = (params.get("search") or "").strip()[:100]
        if search:
            condition = (
                Q(name__icontains=search)
                | Q(mobile_number__icontains=search)
                | Q(email__icontains=search)
            )
            digits = re.sub(r"\D", "", search)
            if len(digits) >= 3:
                condition |= Q(mobile_number__icontains=digits)
            # "+91 98765 43210" is stored as its last 10 digits.
            if len(digits) > 10:
                condition |= Q(mobile_number__icontains=digits[-10:])
            queryset = queryset.filter(condition)

        return queryset

    def list(self, request, *args, **kwargs):
        if get_owned_event_or_none(kwargs["event_pk"], request.user) is None:
            return event_not_found()

        queryset = self.filter_queryset(self.get_queryset())
        page = self.paginate_queryset(queryset)

        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)

        serializer = self.get_serializer(queryset, many=True)

        return Response(
            {
                "success": True,
                "message": "Guests retrieved successfully.",
                "data": serializer.data,
            },
            status=status.HTTP_200_OK,
        )

    def post(self, request, event_pk):
        event = get_owned_event_or_none(event_pk, request.user)

        if event is None:
            return event_not_found()

        self.event = event
        serializer = GuestSerializer(data=request.data, context={"view": self, "request": request})

        if not serializer.is_valid():
            return validation_failed("Guest creation failed.", serializer.errors)

        try:
            guest = create_guest(
                event=event,
                organizer=request.user,
                validated_data=serializer.validated_data,
            )

        except GuestError as error:
            return service_error(error, GUEST_ERROR_STATUS_MAP, "guest")

        return Response(
            {
                "success": True,
                "message": "Guest added successfully.",
                "data": GuestSerializer(guest).data,
            },
            status=status.HTTP_201_CREATED,
        )


class GuestDetailView(APIView):
    """Retrieve, update, or delete a single guest of the organizer's event."""

    permission_classes = [IsAuthenticated, IsOrganizer]

    def get_object(self, event_pk, guest_pk, user) -> Guest | None:
        return (
            Guest.objects.filter(pk=guest_pk, event__pk=event_pk, event__organizer=user)
            .select_related("category")
            .first()
        )

    def get(self, request, event_pk, guest_pk):
        guest = self.get_object(event_pk, guest_pk, request.user)

        if guest is None:
            return guest_not_found()

        return Response(
            {
                "success": True,
                "message": "Guest retrieved successfully.",
                "data": GuestSerializer(guest).data,
            },
            status=status.HTTP_200_OK,
        )

    def patch(self, request, event_pk, guest_pk):
        guest = self.get_object(event_pk, guest_pk, request.user)

        if guest is None:
            return guest_not_found()

        serializer = GuestSerializer(guest, data=request.data, partial=True)

        if not serializer.is_valid():
            return validation_failed("Guest update failed.", serializer.errors)

        try:
            updated_guest = update_guest(guest, serializer.validated_data)

        except GuestError as error:
            return service_error(error, GUEST_ERROR_STATUS_MAP, "guest")

        return Response(
            {
                "success": True,
                "message": "Guest updated successfully.",
                "data": GuestSerializer(updated_guest).data,
            },
            status=status.HTTP_200_OK,
        )

    def delete(self, request, event_pk, guest_pk):
        guest = self.get_object(event_pk, guest_pk, request.user)

        if guest is None:
            return guest_not_found()

        delete_guest(guest)

        return Response(
            {"success": True, "message": "Guest deleted successfully.", "data": {}},
            status=status.HTTP_200_OK,
        )


class GuestCSVImportView(APIView):
    """Import guests for an event from an uploaded CSV file."""

    permission_classes = [IsAuthenticated, IsOrganizer]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request, event_pk):
        event = get_owned_event_or_none(event_pk, request.user)

        if event is None:
            return event_not_found()

        csv_file = request.FILES.get("file")

        if csv_file is None:
            return validation_failed("No file uploaded.", {"file": ["This field is required."]})

        # Optional category_id: every guest without its own category column
        # value lands in this category.
        category = None
        category_id = request.data.get("category_id")

        if category_id:
            category = (
                GuestCategory.objects.filter(pk=category_id, event=event).first()
                if str(category_id).isdigit()
                else None
            )

            if category is None:
                return validation_failed(
                    "Invalid category.",
                    {"category_id": ["This category does not belong to this event."]},
                )

        try:
            result = import_guests_from_csv(
                event=event,
                organizer=request.user,
                csv_file=csv_file,
                category=category,
            )

        except GuestError as error:
            return service_error(error, GUEST_ERROR_STATUS_MAP, "file")

        return Response(
            {
                "success": True,
                "message": (
                    f"Import complete: {result['created_count']} added, "
                    f"{result['skipped_count']} skipped."
                ),
                "data": CSVImportResultSerializer(result).data,
            },
            status=status.HTTP_200_OK,
        )


class GuestCSVExportView(APIView):
    """Export an event's guest list as a downloadable CSV file."""

    permission_classes = [IsAuthenticated, IsOrganizer]

    def get(self, request, event_pk):
        event = get_owned_event_or_none(event_pk, request.user)

        if event is None:
            return event_not_found()

        response = HttpResponse(export_guests_to_csv(event), content_type="text/csv")
        response["Content-Disposition"] = f'attachment; filename="guests-event-{event_pk}.csv"'

        return response


class GuestContactImportView(APIView):
    """Bulk-create guests from the frontend's Contact Picker review table."""

    permission_classes = [IsAuthenticated, IsOrganizer]

    def post(self, request, event_pk):
        event = get_owned_event_or_none(event_pk, request.user)

        if event is None:
            return event_not_found()

        serializer = ContactImportRequestSerializer(data=request.data)

        if not serializer.is_valid():
            return validation_failed("Contact import failed.", serializer.errors)

        # A category from ANOTHER event must not be slipped into the payload.
        for row in serializer.validated_data["guests"]:
            category = row.get("category")

            if category is not None and category.event_id != event.id:
                return validation_failed(
                    "Contact import failed.",
                    {"guests": [f"Category '{category.name}' does not belong to this event."]},
                )

        result = bulk_import_guests(
            event=event,
            organizer=request.user,
            rows=serializer.validated_data["guests"],
        )

        return Response(
            {
                "success": True,
                "message": (
                    f"Import complete: {result['created_count']} added, "
                    f"{result['skipped_count']} skipped."
                ),
                "data": ContactImportResultSerializer(result).data,
            },
            status=status.HTTP_200_OK,
        )


class GuestCategoryListCreateView(APIView):
    """List an event's guest categories (with live guest counts) or add one."""

    permission_classes = [IsAuthenticated, IsOrganizer]

    def get(self, request, event_pk):
        event = get_owned_event_or_none(event_pk, request.user)

        if event is None:
            return event_not_found()

        categories = GuestCategory.objects.filter(event=event).annotate(guest_total=Count("guests"))

        return Response(
            {
                "success": True,
                "message": "Guest categories retrieved successfully.",
                "data": GuestCategorySerializer(categories, many=True).data,
            },
            status=status.HTTP_200_OK,
        )

    def post(self, request, event_pk):
        event = get_owned_event_or_none(event_pk, request.user)

        if event is None:
            return event_not_found()

        serializer = GuestCategorySerializer(data=request.data)

        if not serializer.is_valid():
            return validation_failed("Category creation failed.", serializer.errors)

        try:
            category = create_category(event, serializer.validated_data)

        except GuestError as error:
            return service_error(error, CATEGORY_ERROR_STATUS_MAP, "name")

        return Response(
            {
                "success": True,
                "message": "Category created successfully.",
                "data": GuestCategorySerializer(category).data,
            },
            status=status.HTTP_201_CREATED,
        )


class GuestCategoryDetailView(APIView):
    """Rename/reorder, or delete, a single guest category."""

    permission_classes = [IsAuthenticated, IsOrganizer]

    def get_object(self, event_pk, category_pk, user) -> GuestCategory | None:
        return GuestCategory.objects.filter(
            pk=category_pk, event__pk=event_pk, event__organizer=user
        ).first()

    def patch(self, request, event_pk, category_pk):
        category = self.get_object(event_pk, category_pk, request.user)

        if category is None:
            return category_not_found()

        serializer = GuestCategorySerializer(category, data=request.data, partial=True)

        if not serializer.is_valid():
            return validation_failed("Category update failed.", serializer.errors)

        try:
            updated_category = update_category(category, serializer.validated_data)

        except GuestError as error:
            return service_error(error, CATEGORY_ERROR_STATUS_MAP, "name")

        return Response(
            {
                "success": True,
                "message": "Category updated successfully.",
                "data": GuestCategorySerializer(updated_category).data,
            },
            status=status.HTTP_200_OK,
        )

    def delete(self, request, event_pk, category_pk):
        category = self.get_object(event_pk, category_pk, request.user)

        if category is None:
            return category_not_found()

        delete_category(category)

        return Response(
            {
                "success": True,
                "message": "Category deleted successfully. Guests in it are now uncategorized.",
                "data": {},
            },
            status=status.HTTP_200_OK,
        )
