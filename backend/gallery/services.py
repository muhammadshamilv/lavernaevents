import io
import logging
import os
import uuid

from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile
from django.db import transaction
from django.db.models import Sum
from events.models import Event

from .models import GalleryMedia

logger = logging.getLogger(__name__)

MB = 1024 * 1024

# Per-file caps. They sit below the proxy / host request-body limits so the
# organizer gets a clear message instead of a dropped connection.
MAX_IMAGE_BYTES = 25 * MB
MAX_VIDEO_BYTES = 100 * MB
MAX_IMAGE_PIXELS = 60_000_000

# Grid thumbnails: a 5 MB original in a 150px tile wastes mobile data and
# makes the gallery crawl, so every image gets a small JPEG preview.
THUMBNAIL_EDGE = 480


_KEEP_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".mp4", ".mov", ".webm"}


def random_filename(original_name: str, default_extension: str) -> str:
    """A new unguessable file name (32 random hex characters).

    Gallery files sit in a public bucket, so the only thing keeping a stranger
    from opening someone's photos is not knowing the address. The original
    name ("face1.jpeg", "wedding-final-3.jpg") is never reused: it is both
    guessable and often reveals who is in the photo.
    """

    extension = os.path.splitext(original_name or "")[1].lower()

    if extension not in _KEEP_EXTENSIONS:
        extension = default_extension

    return f"{uuid.uuid4().hex}{extension}"


class GalleryError(Exception):
    """Raised when a gallery action cannot be completed."""

    def __init__(self, message: str, code: str = "gallery_error"):
        self.message = message
        self.code = code
        super().__init__(message)


# ---------------------------------------------------------------------
# Access and plan
# ---------------------------------------------------------------------

def can_view_gallery(user, event: Event) -> bool:
    """An organizer can always view their own event's gallery. A
    photographer can view it only with a currently-valid access grant."""

    if user.role == "ORGANIZER":
        return event.organizer_id == user.id

    if user.role == "PHOTOGRAPHER":
        from photographers.services import PhotographerAccessError, check_photographer_event_access

        try:
            check_photographer_event_access(user, event)
            return True
        except PhotographerAccessError:
            return False

    return False


def get_storage_usage(organizer) -> dict:
    """Bytes of gallery media the organizer has stored across ALL their
    events, against the storage limit of their plan (None = unlimited)."""

    from memberships.utils import get_effective_plan

    used = (
        GalleryMedia.objects.filter(event__organizer=organizer).aggregate(total=Sum("file_size"))["total"]
        or 0
    )

    plan = get_effective_plan(organizer)
    limit_mb = getattr(plan, "storage_limit_mb", None) if plan else 0

    return {
        "used_bytes": used,
        "limit_bytes": None if limit_mb is None else limit_mb * MB,
    }


def _require_gallery_plan(organizer, uploaded_by):
    """The event owner's plan must include the gallery. Photographers
    upload on the owner's plan, so they get a message that points them at
    the right person."""

    from memberships.utils import get_effective_plan

    plan = get_effective_plan(organizer)
    is_owner = uploaded_by is not None and uploaded_by.pk == organizer.pk

    if plan is None or not plan.gallery_enabled:
        raise GalleryError(
            "The gallery is not included in your plan. Upgrade to upload photos and videos."
            if is_owner
            else "Uploads are switched off for this event. Please contact the organizer.",
            code="gallery_not_enabled",
        )

    return plan


# ---------------------------------------------------------------------
# Upload
# ---------------------------------------------------------------------

def _check_image_and_make_thumbnail(file) -> ContentFile:
    """Confirm the upload really is an image (the extension alone can be
    anything) and build its thumbnail."""

    from PIL import Image, ImageOps

    try:
        file.seek(0)
        probe = Image.open(file)
        probe.verify()  # structural check; the file object must be reopened after

        file.seek(0)
        image = Image.open(file)

        if image.width * image.height > MAX_IMAGE_PIXELS:
            raise GalleryError("That image has too many pixels to process.", code="invalid_image")

        image = ImageOps.exif_transpose(image).convert("RGB")
        image.thumbnail((THUMBNAIL_EDGE, THUMBNAIL_EDGE))

        buffer = io.BytesIO()
        image.save(buffer, format="JPEG", quality=80, optimize=True)

    except GalleryError:
        raise
    except (OSError, ValueError, SyntaxError, Image.DecompressionBombError):
        raise GalleryError(
            "That file isn't a valid image. Please check it and try again.",
            code="invalid_image",
        )
    finally:
        file.seek(0)

    return ContentFile(buffer.getvalue(), name=random_filename("", ".jpg"))


def upload_media(
    event: Event,
    uploaded_by,
    media_type: str,
    file,
    thumbnail=None,
    caption: str = "",
) -> GalleryMedia:
    """Create a gallery media record. The caller has already checked
    can_view_gallery; this checks everything about the FILE and the PLAN:

    - the owner's plan includes the gallery;
    - the file is within the size cap for its type;
    - images are real images, and get a thumbnail;
    - the owner's total stored media stays inside plan.storage_limit_mb.

    The owner's row is locked while the quota is checked, so several
    uploads arriving together (a photographer sending 20 photos at once)
    cannot all squeeze through just under the limit.
    """

    size = getattr(file, "size", None) or 0
    is_image = media_type == GalleryMedia.MediaType.IMAGE
    cap = MAX_IMAGE_BYTES if is_image else MAX_VIDEO_BYTES

    if size > cap:
        raise GalleryError(
            f"That file is too large. {'Photos' if is_image else 'Videos'} can be up to {cap // MB} MB.",
            code="file_too_large",
        )

    # Store everything under random names (see random_filename).
    try:
        file.name = random_filename(getattr(file, "name", ""), ".jpg" if is_image else ".mp4")

        if thumbnail is not None:
            thumbnail.name = random_filename(getattr(thumbnail, "name", ""), ".jpg")
    except AttributeError:  # an object whose name cannot be changed keeps its own
        pass

    # Images are always verified; the thumbnail is only used when the client sent none.
    generated_thumbnail = _check_image_and_make_thumbnail(file) if is_image else None

    User = get_user_model()

    with transaction.atomic():
        organizer = User.objects.select_for_update().get(pk=event.organizer_id)

        plan = _require_gallery_plan(organizer, uploaded_by)

        limit_mb = plan.storage_limit_mb

        if limit_mb is not None:
            used = (
                GalleryMedia.objects.filter(event__organizer=organizer).aggregate(total=Sum("file_size"))["total"]
                or 0
            )

            if used + size > limit_mb * MB:
                raise GalleryError(
                    "The storage limit of the plan has been reached. "
                    + (
                        "Delete some media or upgrade your plan."
                        if uploaded_by is not None and uploaded_by.pk == organizer.pk
                        else "Please ask the organizer to free up space."
                    ),
                    code="storage_limit_exceeded",
                )

        media = GalleryMedia.objects.create(
            event=event,
            uploaded_by=uploaded_by,
            media_type=media_type,
            file=file,
            thumbnail=thumbnail if thumbnail is not None else generated_thumbnail,
            caption=caption,
            file_size=size or None,
        )

        # Look for faces once the upload is safely saved, so guests can find
        # this photo with a selfie. Only plans that include QR codes / face
        # search pay that cost; the photo waits as PENDING otherwise.
        if is_image and plan.qr_code_enabled:
            transaction.on_commit(_schedule_face_scan)

        return media


def _schedule_face_scan() -> None:
    """Never let a scanning problem turn a successful upload into an error."""

    try:
        from .face_scan import start_background_scan

        start_background_scan()
    except Exception:
        logger.warning("Could not start the face scan.", exc_info=True)


# ---------------------------------------------------------------------
# Delete / feature
# ---------------------------------------------------------------------

def delete_media(media: GalleryMedia) -> None:
    """Permanently delete a gallery media item and its files.

    The database row goes first (and its face data with it, by cascade).
    A storage hiccup while removing the files must not leave a broken
    gallery entry behind, so file errors are logged, not raised.
    """

    stored = [(field.storage, field.name) for field in (media.file, media.thumbnail) if field and field.name]

    with transaction.atomic():
        media.delete()

    for storage, name in stored:
        try:
            storage.delete(name)
        except Exception:
            logger.warning("Could not remove gallery file %s from storage.", name, exc_info=True)


def toggle_featured(media: GalleryMedia) -> GalleryMedia:
    """Flip a media item's featured flag."""

    media.is_featured = not media.is_featured
    media.save(update_fields=["is_featured", "updated_at"])

    return media