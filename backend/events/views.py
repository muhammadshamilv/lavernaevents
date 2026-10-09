from common.permissions import IsOrganizer
from django.db.models import Q
from rest_framework import status
from rest_framework.generics import ListAPIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Event
from .serializers import EventListSerializer, EventSerializer
from .services import EventError, create_event, delete_event, today, update_event

EVENT_ERROR_STATUS_MAP = {
    "event_limit_exceeded": status.HTTP_409_CONFLICT,
    "no_active_plan": status.HTTP_402_PAYMENT_REQUIRED,
}


def _event_error_response(error: EventError) -> Response:
    return Response(
        {
            "success": False,
            "message": error.message,
            "errors": {"event": [error.message]},
        },
        status=EVENT_ERROR_STATUS_MAP.get(error.code, status.HTTP_400_BAD_REQUEST),
    )


def _not_found_response() -> Response:
    return Response(
        {
            "success": False,
            "message": "Event not found.",
            "errors": {"event": ["No event found with this ID."]},
        },
        status=status.HTTP_404_NOT_FOUND,
    )


class EventListCreateView(ListAPIView):
    """List the organizer's own events, or create a new one.

    GET query params (all optional):
      status=DRAFT|PUBLISHED|CANCELLED|COMPLETED
      event_type=WEDDING|...
      search=<text>            (name / venue / host)
      when=upcoming|past       (upcoming = today or later, soonest first)
      page, page_size
    """

    serializer_class = EventListSerializer
    permission_classes = [IsAuthenticated, IsOrganizer]

    def get_queryset(self):
        """Return only events belonging to the requesting organizer."""

        queryset = Event.objects.filter(organizer=self.request.user)
        params = self.request.query_params

        status_value = (params.get("status") or "").upper()
        if status_value in Event.Status.values:
            queryset = queryset.filter(status=status_value)

        type_value = (params.get("event_type") or "").upper()
        if type_value in Event.EventType.values:
            queryset = queryset.filter(event_type=type_value)

        search = (params.get("search") or "").strip()[:100]
        if search:
            queryset = queryset.filter(
                Q(name__icontains=search)
                | Q(venue_name__icontains=search)
                | Q(host_name__icontains=search)
            )

        when = (params.get("when") or "").lower()
        if when == "upcoming":
            queryset = queryset.filter(event_date__gte=today()).order_by(
                "event_date", "event_time"
            )
        elif when == "past":
            queryset = queryset.filter(event_date__lt=today()).order_by(
                "-event_date", "-event_time"
            )

        return queryset

    def post(self, request, *args, **kwargs):
        """Create a new event for the requesting organizer."""

        serializer = EventSerializer(data=request.data, context={"request": request})

        if not serializer.is_valid():
            return Response(
                {
                    "success": False,
                    "message": "Event creation failed.",
                    "errors": serializer.errors,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            event = create_event(
                organizer=request.user,
                validated_data=serializer.validated_data,
            )

        except EventError as error:
            return _event_error_response(error)

        return Response(
            {
                "success": True,
                "message": "Event created successfully.",
                "data": EventSerializer(event, context={"request": request}).data,
            },
            status=status.HTTP_201_CREATED,
        )


class EventDetailView(APIView):
    """Retrieve, update, or delete a single event owned by the requesting organizer.

    Another organizer's event answers 404 (not 403), so event ids can't be
    probed.
    """

    permission_classes = [IsAuthenticated, IsOrganizer]

    def get_object(self, pk, request):
        return Event.objects.filter(pk=pk, organizer=request.user).first()

    def get(self, request, pk):
        event = self.get_object(pk, request)

        if event is None:
            return _not_found_response()

        return Response(
            {
                "success": True,
                "message": "Event retrieved successfully.",
                "data": EventSerializer(event, context={"request": request}).data,
            },
            status=status.HTTP_200_OK,
        )

    def patch(self, request, pk):
        event = self.get_object(pk, request)

        if event is None:
            return _not_found_response()

        serializer = EventSerializer(
            event,
            data=request.data,
            partial=True,
            context={"request": request},
        )

        if not serializer.is_valid():
            return Response(
                {
                    "success": False,
                    "message": "Event update failed.",
                    "errors": serializer.errors,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            updated_event = update_event(event, serializer.validated_data)

        except EventError as error:
            return _event_error_response(error)

        return Response(
            {
                "success": True,
                "message": "Event updated successfully.",
                "data": EventSerializer(updated_event, context={"request": request}).data,
            },
            status=status.HTTP_200_OK,
        )

    def delete(self, request, pk):
        event = self.get_object(pk, request)

        if event is None:
            return _not_found_response()

        delete_event(event)

        return Response(
            {
                "success": True,
                "message": "Event deleted successfully.",
                "data": {},
            },
            status=status.HTTP_200_OK,
        )