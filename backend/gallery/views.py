from common.permissions import IsOrganizer
from django.shortcuts import get_object_or_404
from events.models import Event
from rest_framework import status
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .face_scan import (
    background_scan_enabled,
    get_face_scan_summary,
    retry_failed,
    start_background_scan,
)
from .models import GalleryMedia
from .serializers import GalleryMediaSerializer, GalleryMediaUploadSerializer
from .services import (
    GalleryError,
    can_view_gallery,
    delete_media,
    get_storage_usage,
    toggle_featured,
    upload_media,
)

GALLERY_ERROR_STATUS_MAP = {
    "gallery_not_enabled": status.HTTP_403_FORBIDDEN,
    "storage_limit_exceeded": status.HTTP_409_CONFLICT,
    "file_too_large": status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
}

DEFAULT_PAGE_SIZE = 60
MAX_PAGE_SIZE = 100


def _not_found() -> Response:
    # The same answer whether the event does not exist or is somebody
    # else's, so event ids cannot be probed.
    return Response(
        {
            "success": False,
            "message": "Event not found.",
            "errors": {"event": ["No event found with this ID."]},
        },
        status=status.HTTP_404_NOT_FOUND,
    )


def _positive_int(value, default: int, maximum: int | None = None) -> int:
    try:
        number = int(value)
    except (TypeError, ValueError):
        return default

    number = max(number, 1)

    return min(number, maximum) if maximum else number


class EventGalleryView(APIView):
    """List an event's gallery (paged), or upload a new photo/video to it.

    Reachable by the organizer who owns the event, or by a photographer
    with a currently-valid access grant - checked via can_view_gallery()
    since the allowed set differs per event.
    """

    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def get_event(self, request, event_pk):
        event = Event.objects.filter(pk=event_pk).first()

        if event is None or not can_view_gallery(request.user, event):
            return None

        return event

    def get(self, request, event_pk):
        """One page of the gallery: ?page=1&page_size=60.

        Featured items first, then newest. The organizer's storage usage
        rides along so the page can show "320 MB of 500 MB".
        """

        event = self.get_event(request, event_pk)

        if event is None:
            return _not_found()

        page = _positive_int(request.query_params.get("page"), 1)
        page_size = _positive_int(request.query_params.get("page_size"), DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)

        queryset = event.gallery_media.select_related("uploaded_by").order_by("-is_featured", "-created_at", "-id")
        total = queryset.count()

        start = (page - 1) * page_size
        items = list(queryset[start : start + page_size])

        data = {
            "results": GalleryMediaSerializer(items, many=True, context={"request": request}).data,
            "count": total,
            "page": page,
            "page_size": page_size,
            "has_more": start + page_size < total,
            "storage": get_storage_usage(event.organizer) if request.user.role == "ORGANIZER" else None,
        }

        return Response(
            {"success": True, "message": "Gallery retrieved successfully.", "data": data},
            status=status.HTTP_200_OK,
        )

    def post(self, request, event_pk):
        """Upload a single photo or video to this event's gallery."""

        event = self.get_event(request, event_pk)

        if event is None:
            return _not_found()

        serializer = GalleryMediaUploadSerializer(data=request.data)

        if not serializer.is_valid():
            return Response(
                {"success": False, "message": "Upload failed.", "errors": serializer.errors},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            media = upload_media(
                event=event,
                uploaded_by=request.user,
                media_type=serializer.validated_data["media_type"],
                file=serializer.validated_data["file"],
                thumbnail=serializer.validated_data.get("thumbnail"),
                caption=serializer.validated_data.get("caption", ""),
            )
        except GalleryError as error:
            return Response(
                {"success": False, "message": error.message, "errors": {"file": [error.message]}},
                status=GALLERY_ERROR_STATUS_MAP.get(error.code, status.HTTP_400_BAD_REQUEST),
            )

        return Response(
            {
                "success": True,
                "message": "Uploaded successfully.",
                "data": GalleryMediaSerializer(media, context={"request": request}).data,
            },
            status=status.HTTP_201_CREATED,
        )


class GalleryMediaDetailView(APIView):
    """Organizer-only: delete a gallery item, or toggle its featured flag."""

    permission_classes = [IsAuthenticated, IsOrganizer]

    def get_media(self, request, event_pk, media_pk):
        return get_object_or_404(
            GalleryMedia,
            pk=media_pk,
            event_id=event_pk,
            event__organizer=request.user,
        )

    def delete(self, request, event_pk, media_pk):
        media = self.get_media(request, event_pk, media_pk)
        delete_media(media)

        return Response(
            {"success": True, "message": "Media deleted successfully.", "data": {}},
            status=status.HTTP_200_OK,
        )

    def patch(self, request, event_pk, media_pk):
        media = toggle_featured(self.get_media(request, event_pk, media_pk))

        return Response(
            {
                "success": True,
                "message": "Media updated successfully.",
                "data": GalleryMediaSerializer(media, context={"request": request}).data,
            },
            status=status.HTTP_200_OK,
        )


class EventFaceScanView(APIView):
    """Organizer-only: how far face scanning of this event's photos is
    (GET), and a "scan again" button (POST) that re-queues photos that
    failed and starts scanning whatever is waiting."""

    permission_classes = [IsAuthenticated, IsOrganizer]

    def get_event(self, request, event_pk):
        return get_object_or_404(Event, pk=event_pk, organizer=request.user)

    @staticmethod
    def _payload(event, message):
        return Response(
            {"success": True, "message": message, "data": get_face_scan_summary(event)},
            status=status.HTTP_200_OK,
        )

    def get(self, request, event_pk):
        event = self.get_event(request, event_pk)

        return self._payload(event, "Face scan status retrieved successfully.")

    def post(self, request, event_pk):
        event = self.get_event(request, event_pk)
        summary = get_face_scan_summary(event)

        if not summary["plan_enabled"]:
            return Response(
                {
                    "success": False,
                    "message": "Face search is not included in your plan. Upgrade to enable it.",
                    "errors": {"plan": ["Face search is not included in your plan."]},
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        if not summary["available"]:
            return Response(
                {
                    "success": False,
                    "message": "Face search is not available on this server yet.",
                    "errors": {"server": ["face_recognition is not installed."]},
                },
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        retry_failed(event.pk)
        started = start_background_scan()

        return self._payload(
            event,
            "Scanning started."
            if started
            else (
                "Scanning is already running."
                if background_scan_enabled()
                else "Photos are scanned on a schedule on this server."
            ),
        )