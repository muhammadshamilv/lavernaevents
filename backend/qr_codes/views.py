import os

from common.permissions import IsOrganizer
from django.http import FileResponse, Http404, HttpResponse
from django.shortcuts import get_object_or_404
from django.utils.text import slugify
from events.models import Event
from gallery.models import GalleryMedia
from rest_framework import status
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .download_tokens import download_token_is_valid
from .serializers import (
    EventQRCodeSerializer,
    QRCodeActiveSerializer,
    ScannedEventSerializer,
    SelfieMatchResultSerializer,
    SelfieUploadSerializer,
)
from .services import (
    QRCodeError,
    ensure_qr_code_allowed,
    generate_qr_pdf_bytes,
    generate_qr_png_bytes,
    get_or_create_event_qr_code,
    match_selfie_to_gallery,
    resolve_active_qr_code,
    set_qr_code_active,
)

QR_ERROR_STATUS_MAP = {
    "no_active_plan": status.HTTP_402_PAYMENT_REQUIRED,
    "qr_not_enabled": status.HTTP_403_FORBIDDEN,
    "face_matching_unavailable": status.HTTP_503_SERVICE_UNAVAILABLE,
}


def _error_response(error: QRCodeError, field: str) -> Response:
    return Response(
        {
            "success": False,
            "message": error.message,
            "errors": {field: [error.message]},
        },
        status=QR_ERROR_STATUS_MAP.get(error.code, status.HTTP_400_BAD_REQUEST),
    )


class _OrganizerQRCodeBase(APIView):
    """Shared by the organizer-only views: the event must be the
    organizer's own (anyone else's id answers 404) and the plan must
    include QR codes."""

    permission_classes = [IsAuthenticated, IsOrganizer]

    def load(self, request, event_pk):
        event = get_object_or_404(Event, pk=event_pk, organizer=request.user)
        ensure_qr_code_allowed(request.user)
        return event, get_or_create_event_qr_code(event)


class EventQRCodeView(_OrganizerQRCodeBase):
    """Organizer-only: view this event's QR code (GET) or switch it on/off
    (PATCH {"is_active": bool}). Created on first access."""

    def _payload(self, request, qr_code, message):
        return Response(
            {
                "success": True,
                "message": message,
                "data": EventQRCodeSerializer(qr_code, context={"request": request}).data,
            },
            status=status.HTTP_200_OK,
        )

    def get(self, request, event_pk):
        try:
            _, qr_code = self.load(request, event_pk)
        except QRCodeError as error:
            return _error_response(error, "qr_code")

        return self._payload(request, qr_code, "QR code retrieved successfully.")

    def patch(self, request, event_pk):
        serializer = QRCodeActiveSerializer(data=request.data)

        if not serializer.is_valid():
            return Response(
                {"success": False, "message": "Invalid request.", "errors": serializer.errors},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            _, qr_code = self.load(request, event_pk)
        except QRCodeError as error:
            return _error_response(error, "qr_code")

        qr_code = set_qr_code_active(qr_code, serializer.validated_data["is_active"])

        return self._payload(
            request,
            qr_code,
            "QR code is now active." if qr_code.is_active else "QR code switched off.",
        )


class EventQRCodePNGView(_OrganizerQRCodeBase):
    """Organizer-only: download this event's QR code as a PNG file."""

    def get(self, request, event_pk):
        try:
            event, qr_code = self.load(request, event_pk)
        except QRCodeError as error:
            return _error_response(error, "qr_code")

        response = HttpResponse(generate_qr_png_bytes(qr_code), content_type="image/png")
        response["Content-Disposition"] = f'attachment; filename="event-{event.pk}-qr-code.png"'
        response["Cache-Control"] = "no-store"
        return response


class EventQRCodePDFView(_OrganizerQRCodeBase):
    """Organizer-only: download a print-ready PDF of the QR code."""

    def get(self, request, event_pk):
        try:
            event, qr_code = self.load(request, event_pk)
        except QRCodeError as error:
            return _error_response(error, "qr_code")

        response = HttpResponse(generate_qr_pdf_bytes(qr_code), content_type="application/pdf")
        response["Content-Disposition"] = f'attachment; filename="event-{event.pk}-qr-code.pdf"'
        response["Cache-Control"] = "no-store"
        return response


class ScannedEventView(APIView):
    """Public, no login: what a guest's browser loads the instant they
    scan the QR code. Returns just enough to render the landing page."""

    permission_classes = [AllowAny]

    def get(self, request, token):
        qr_code = resolve_active_qr_code(token)

        return Response(
            {
                "success": True,
                "message": "Event retrieved successfully.",
                "data": ScannedEventSerializer(qr_code.event, context={"request": request}).data,
            },
            status=status.HTTP_200_OK,
        )


class GuestSelfieMatchView(APIView):
    """Public, no login: the guest uploads a selfie and gets back every
    gallery photo containing their face (synchronous, one request)."""

    permission_classes = [AllowAny]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request, token):
        qr_code = resolve_active_qr_code(token)

        serializer = SelfieUploadSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(
                {
                    "success": False,
                    "message": "Please upload a selfie photo.",
                    "errors": serializer.errors,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            matched_media, session = match_selfie_to_gallery(
                event=qr_code.event,
                selfie_file=serializer.validated_data["selfie"],
            )
        except QRCodeError as error:
            return _error_response(error, "selfie")

        result = SelfieMatchResultSerializer(
            {"match_count": session.match_count, "matched_media": matched_media},
            context={"request": request, "token": str(token)},
        )

        response = Response(
            {
                "success": True,
                "message": (
                    "We found photos of you!"
                    if matched_media
                    else "No matching photos were found yet. Check back later as more photos are uploaded."
                ),
                "data": result.data,
            },
            status=status.HTTP_200_OK,
        )
        response["Cache-Control"] = "no-store"
        return response


class GuestMediaDownloadView(APIView):
    """Public, no login: download one photo of this event as a file.

    A plain link to the storage URL cannot force a download from another
    origin (browsers ignore the `download` attribute there), so phones
    just open the picture instead of saving it. Serving it from here with
    Content-Disposition: attachment makes the Download button really
    download. The photo must belong to the QR code's own event AND the
    link must carry the signed token (?t=) that the selfie search issued
    for exactly this photo - otherwise ids could simply be counted up.
    """

    permission_classes = [AllowAny]

    def get(self, request, token, media_id):
        qr_code = resolve_active_qr_code(token)

        # Same answer for "no such photo" and "not yours", so nothing leaks.
        if not download_token_is_valid(request.query_params.get("t", ""), token, media_id):
            raise Http404("File not found.")

        media = get_object_or_404(GalleryMedia, pk=media_id, event=qr_code.event)

        try:
            file_handle = media.file.open("rb")
        except (FileNotFoundError, OSError):
            raise Http404("File not found.")

        extension = os.path.splitext(media.file.name)[1].lower() or ".jpg"
        event_slug = slugify(qr_code.event.name)[:40] or "event"

        response = FileResponse(file_handle, as_attachment=True, filename=f"{event_slug}-photo-{media.id}{extension}")
        response["Cache-Control"] = "private, max-age=0, no-store"
        return response