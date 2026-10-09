import io
import json
import logging
from pathlib import Path

import qrcode
from decouple import config
from django.conf import settings
from django.shortcuts import get_object_or_404
from events.models import Event
from gallery.models import GalleryMedia
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader, simpleSplit
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

from .models import EventQRCode, GuestSelfieSession

logger = logging.getLogger(__name__)

# How close two face encodings must be to count as the same person.
# face_recognition suggests 0.6 as its default, but that is loose enough to
# show a guest a stranger's photo - and here the result is shown to ANYONE
# holding the QR code. 0.5 trades a few missed matches for far fewer wrong
# ones. Override with FACE_MATCH_TOLERANCE in settings if real events show
# a different balance.
DEFAULT_FACE_MATCH_TOLERANCE = 0.5

# A selfie from a modern phone is 4-12 MB / 12+ megapixels. Face detection
# on that is slow (this runs inside a web request) and gains nothing, so it
# is shrunk first. 1024px on the long edge is plenty for one close-up face.
SELFIE_MAX_EDGE = 1024
MAX_SELFIE_BYTES = 8 * 1024 * 1024
MAX_SELFIE_PIXELS = 40_000_000

# Never return an unbounded number of photos to an anonymous caller.
MAX_MATCHES = 300

_FONT_DIR = Path(__file__).resolve().parent.parent / "invitations" / "fonts"


class QRCodeError(Exception):
    """Raised when a QR code action cannot be completed."""

    def __init__(self, message: str, code: str = "qr_code_error"):
        self.message = message
        self.code = code
        super().__init__(message)


# ---------------------------------------------------------------------
# Organizer side
# ---------------------------------------------------------------------

def ensure_qr_code_allowed(user) -> None:
    """The QR feature belongs to the organizer's plan (plan.qr_code_enabled)."""

    from memberships.utils import get_effective_plan

    plan = get_effective_plan(user)

    if plan is None:
        raise QRCodeError(
            "You need an active plan to use QR codes.",
            code="no_active_plan",
        )

    if not plan.qr_code_enabled:
        raise QRCodeError(
            "QR codes are not included in your current plan. Upgrade to enable them.",
            code="qr_not_enabled",
        )


def get_or_create_event_qr_code(event: Event) -> EventQRCode:
    """Every event gets exactly one QR code, created lazily the first
    time it's needed (viewing the QR page, or downloading PNG/PDF)."""

    qr_code, _ = EventQRCode.objects.get_or_create(event=event)
    return qr_code


def set_qr_code_active(qr_code: EventQRCode, is_active: bool) -> EventQRCode:
    """Pull a QR code out of service (event postponed, photos not ready)
    or put it back. A deactivated code looks exactly like an unknown one
    to guests."""

    if qr_code.is_active != is_active:
        qr_code.is_active = is_active
        qr_code.save(update_fields=["is_active", "updated_at"])

    return qr_code


def build_scan_url(qr_code: EventQRCode) -> str:
    """The URL embedded in the QR image - what a guest's phone camera
    actually opens. Points at the FRONTEND's public scan route (not an
    API endpoint), since that route renders the camera/selfie UI."""

    base = str(getattr(settings, "FRONTEND_BASE_URL", "") or "http://localhost:5173").rstrip("/")
    return f"{base}/scan/{qr_code.token}"


def public_backend_url() -> str:
    return config("PUBLIC_BACKEND_URL", default="").rstrip("/")


def generate_qr_png_bytes(qr_code: EventQRCode) -> bytes:
    """Renders the QR code as PNG bytes, ready to return as a file
    response or embed in a PDF."""

    qr = qrcode.QRCode(
        version=None,
        error_correction=qrcode.constants.ERROR_CORRECT_H,
        box_size=10,
        border=4,
    )
    qr.add_data(build_scan_url(qr_code))
    qr.make(fit=True)

    image = qr.make_image(fill_color="black", back_color="white")

    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def _pdf_fonts() -> tuple[str, str]:
    """(regular, bold) font names. DejaVu Sans (bundled for invitation
    cards) covers accented and non-Latin-script event names that the
    built-in Helvetica prints as black boxes; fall back to Helvetica if
    the files are missing."""

    regular, bold = _FONT_DIR / "DejaVuSans.ttf", _FONT_DIR / "DejaVuSans-Bold.ttf"

    try:
        if regular.exists() and bold.exists():
            if "QRSans" not in pdfmetrics.getRegisteredFontNames():
                pdfmetrics.registerFont(TTFont("QRSans", str(regular)))
                pdfmetrics.registerFont(TTFont("QRSans-Bold", str(bold)))
            return "QRSans", "QRSans-Bold"
    except Exception:  # a broken font file must not break the download
        logger.warning("Could not load report fonts for the QR PDF.", exc_info=True)

    return "Helvetica", "Helvetica-Bold"


def generate_qr_pdf_bytes(qr_code: EventQRCode) -> bytes:
    """A simple, print-ready A4 PDF: heading, event name, the QR image
    centered, an instruction line and the plain link as a fallback for
    anyone who cannot scan."""

    event = qr_code.event
    regular, bold = _pdf_fonts()
    png_buffer = io.BytesIO(generate_qr_png_bytes(qr_code))

    buffer = io.BytesIO()
    pdf = canvas.Canvas(buffer, pagesize=A4)
    page_width, page_height = A4
    margin = 20 * mm
    text_width = page_width - 2 * margin

    y = page_height - 45 * mm
    pdf.setFont(bold, 22)
    for line in simpleSplit("Scan to view & download your photos", bold, 22, text_width):
        pdf.drawCentredString(page_width / 2, y, line)
        y -= 10 * mm

    # Long event names wrap (max 3 lines) instead of running off the page.
    pdf.setFont(regular, 15)
    for line in simpleSplit(event.name, regular, 15, text_width)[:3]:
        pdf.drawCentredString(page_width / 2, y, line)
        y -= 7 * mm

    qr_size = 90 * mm
    qr_x = (page_width - qr_size) / 2
    qr_y = y - 10 * mm - qr_size
    pdf.drawImage(ImageReader(png_buffer), qr_x, qr_y, width=qr_size, height=qr_size)

    y = qr_y - 12 * mm
    pdf.setFont(regular, 11)
    for line in simpleSplit(
        "Take a selfie after scanning to find and download every photo you're in.",
        regular,
        11,
        text_width,
    ):
        pdf.drawCentredString(page_width / 2, y, line)
        y -= 6 * mm

    pdf.setFont(regular, 8)
    pdf.setFillGray(0.45)
    for line in simpleSplit(build_scan_url(qr_code), regular, 8, text_width):
        pdf.drawCentredString(page_width / 2, y - 4 * mm, line)
        y -= 4 * mm

    pdf.setFont(regular, 9)
    pdf.drawCentredString(page_width / 2, 15 * mm, "Powered by LavernaEvents")

    pdf.showPage()
    pdf.save()

    return buffer.getvalue()


# ---------------------------------------------------------------------
# Guest side
# ---------------------------------------------------------------------

def resolve_active_qr_code(token) -> EventQRCode:
    """Looks up an EventQRCode by its public token for the guest-facing
    scan flow. A deactivated code is treated the same as not-found, so a
    guest gets no signal that a code ever existed at that URL."""

    return get_object_or_404(
        EventQRCode.objects.select_related("event"),
        token=token,
        is_active=True,
    )


def _load_selfie_array(selfie_file):
    """Selfie upload -> RGB numpy array, upright and at most
    SELFIE_MAX_EDGE px on its long edge.

    Phone cameras store portrait photos sideways plus an EXIF "rotate me"
    flag. face_recognition ignores that flag, so a normal portrait selfie
    would arrive lying on its side and no face would be found - hence the
    explicit transpose.
    """

    import numpy as np
    from PIL import Image, ImageOps

    try:
        selfie_file.seek(0)
        image = Image.open(selfie_file)

        if image.width * image.height > MAX_SELFIE_PIXELS:
            raise QRCodeError(
                "That photo is too large. Please take a new selfie with your phone camera.",
                code="invalid_image",
            )

        image = ImageOps.exif_transpose(image).convert("RGB")
        image.thumbnail((SELFIE_MAX_EDGE, SELFIE_MAX_EDGE))

        return np.array(image)

    except QRCodeError:
        raise
    except (OSError, ValueError, Image.DecompressionBombError):
        raise QRCodeError(
            "We couldn't read that photo. Please take a new selfie.",
            code="invalid_image",
        )


def _largest_face_encoding(face_recognition, image_array):
    """The encoding of the biggest face in the selfie. If a bystander
    sneaks into the frame, the person holding the phone is almost always
    the closest, i.e. the largest."""

    locations = face_recognition.face_locations(image_array)

    if not locations:
        raise QRCodeError(
            "No face was detected in that photo. Please retake your selfie in good lighting, facing the camera.",
            code="no_face_detected",
        )

    largest = max(
        locations,
        key=lambda box: (box[2] - box[0]) * (box[1] - box[3]),  # (top, right, bottom, left)
    )

    encodings = face_recognition.face_encodings(image_array, [largest])

    if not encodings:
        raise QRCodeError(
            "We couldn't read your face clearly. Please retake your selfie in good lighting.",
            code="no_face_detected",
        )

    return encodings[0]


def match_selfie_to_gallery(event: Event, selfie_file) -> tuple[list[GalleryMedia], GuestSelfieSession]:
    """Given one selfie photo, find every gallery photo in `event` that
    contains the same face.

    The selfie is read into memory only, never saved, and discarded when
    this returns - keeping a stranger's biometric photo with no account or
    consent attached would be a privacy liability with no product benefit.
    Only the (non-reversible) encoding is compared against the encodings
    computed when each gallery photo was uploaded.
    """

    try:
        import face_recognition
    except ImportError:
        logger.error("face_recognition is not installed; selfie matching is unavailable.")
        raise QRCodeError(
            "Photo matching is temporarily unavailable. Please try again later.",
            code="face_matching_unavailable",
        )

    image_array = _load_selfie_array(selfie_file)
    selfie_encoding = _largest_face_encoding(face_recognition, image_array)

    matched_media_ids = _find_matching_media_ids(event, selfie_encoding)

    matched_media = list(
        GalleryMedia.objects.filter(id__in=matched_media_ids).order_by("-is_featured", "-created_at")[:MAX_MATCHES]
    )

    session = GuestSelfieSession.objects.create(event=event, match_count=len(matched_media))
    if matched_media:
        session.matched_media.set(matched_media)

    return matched_media, session


def _find_matching_media_ids(event: Event, selfie_encoding) -> set[int]:
    """Compares one selfie encoding against every stored FaceEmbedding
    for this event's photos, returning the ids of media with at least one
    matching face."""

    import face_recognition
    import numpy as np

    from gallery.models import FaceEmbedding

    rows = FaceEmbedding.objects.filter(
        media__event=event,
        media__media_type=GalleryMedia.MediaType.IMAGE,
    ).values_list("media_id", "encoding_json")

    known_media_ids: list[int] = []
    known_encodings: list = []

    for media_id, encoding_json in rows.iterator():
        known_media_ids.append(media_id)
        known_encodings.append(np.array(json.loads(encoding_json)))

    if not known_encodings:
        return set()

    tolerance = float(getattr(settings, "FACE_MATCH_TOLERANCE", DEFAULT_FACE_MATCH_TOLERANCE))
    distances = face_recognition.face_distance(known_encodings, selfie_encoding)

    return {
        media_id
        for media_id, distance in zip(known_media_ids, distances)
        if distance <= tolerance
    }
