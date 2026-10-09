from common.permissions import IsOrganizer
from events.models import Event
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .serializers import (
    ChartDataPointSerializer,
    EventDashboardSerializer,
    OrganizerInvitationOverviewSerializer,
    OrganizerOverviewSerializer,
)
from .services import (
    get_event_dashboard_stats,
    get_event_invitation_chart_data,
    get_event_response_chart_data,
    get_organizer_invitation_overview,
    get_organizer_overview_stats,
)


def get_owned_event_or_none(pk: int, user) -> Event | None:
    """Return the event only if it exists and belongs to the requesting user."""

    return Event.objects.filter(pk=pk, organizer=user).first()


def _not_found_response() -> Response:
    return Response(
        {
            "success": False,
            "message": "Event not found.",
            "errors": {"event": ["No event found with this ID."]},
        },
        status=status.HTTP_404_NOT_FOUND,
    )


class EventDashboardView(APIView):
    """Return dashboard statistics for a single event."""

    permission_classes = [IsAuthenticated, IsOrganizer]

    def get(self, request, event_pk):
        """Compute and return the event's guest/attendance statistics."""

        event = get_owned_event_or_none(event_pk, request.user)

        if event is None:
            return _not_found_response()

        stats = get_event_dashboard_stats(event)

        serializer = EventDashboardSerializer(stats)

        return Response(
            {
                "success": True,
                "message": "Dashboard statistics retrieved successfully.",
                "data": serializer.data,
            },
            status=status.HTTP_200_OK,
        )


class EventChartsView(APIView):
    """Return chart-ready data for an event's guest responses and invitation status."""

    permission_classes = [IsAuthenticated, IsOrganizer]

    def get(self, request, event_pk):
        """Return response and invitation status breakdowns for charting."""

        event = get_owned_event_or_none(event_pk, request.user)

        if event is None:
            return _not_found_response()

        response_chart = get_event_response_chart_data(event)
        invitation_chart = get_event_invitation_chart_data(event)

        response_serializer = ChartDataPointSerializer(response_chart, many=True)
        invitation_serializer = ChartDataPointSerializer(invitation_chart, many=True)

        return Response(
            {
                "success": True,
                "message": "Chart data retrieved successfully.",
                "data": {
                    "response_breakdown": response_serializer.data,
                    "invitation_breakdown": invitation_serializer.data,
                },
            },
            status=status.HTTP_200_OK,
        )


class OrganizerOverviewView(APIView):
    """Return a high-level summary across all of the organizer's events."""

    permission_classes = [IsAuthenticated, IsOrganizer]

    def get(self, request):
        """Compute and return the organizer's overall stats."""

        stats = get_organizer_overview_stats(request.user)

        serializer = OrganizerOverviewSerializer(stats)

        return Response(
            {
                "success": True,
                "message": "Overview statistics retrieved successfully.",
                "data": serializer.data,
            },
            status=status.HTTP_200_OK,
        )


class OrganizerInvitationDashboardView(APIView):
    """Return the full invitation-focused dashboard payload -
    overview stats, channel performance, events needing attention, and
    quota usage - in one call."""

    permission_classes = [IsAuthenticated, IsOrganizer]

    def get(self, request):
        data = get_organizer_invitation_overview(request.user)

        serializer = OrganizerInvitationOverviewSerializer(data)

        return Response(
            {
                "success": True,
                "message": "Dashboard retrieved successfully.",
                "data": serializer.data,
            },
            status=status.HTTP_200_OK,
        )
