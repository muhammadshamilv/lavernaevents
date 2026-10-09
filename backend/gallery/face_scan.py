"""Finds the faces in uploaded gallery photos, once, in the background.

A guest's selfie (qr_codes/services.py) is compared against the face data
stored here, so a photo only becomes findable after it has been scanned.

How scanning is started
-----------------------
- Automatically after a photo is uploaded (``start_background_scan``),
  when the organizer's plan includes QR codes / face search.
- By the organizer from the gallery page ("Scan again").
- By ``python manage.py scan_faces`` - for backfilling old photos or for a
  scheduled job. This is the dependable path: it does not depend on a web
  process staying alive.

Photos waiting to be scanned simply have ``face_scan_status = PENDING``;
that column is the queue, so nothing is lost if the server restarts - the
next trigger picks the waiting photos up again.

Every function that reads or writes models imports them lazily so this
module can be imported without Django being fully set up.
"""

import json
import logging
import threading
import time

from decouple import config
from django.db import connections, transaction

logger = logging.getLogger(__name__)

# Photos are shrunk before detection: a 12 MP phone photo gives the same
# faces as a 1600 px copy, in a fraction of the time and memory.
SCAN_MAX_EDGE = 1600
MAX_SCAN_PIXELS = 60_000_000

# Faces smaller than this (in the shrunk image) are background specks;
# their encodings are unreliable and cause wrong matches.
MIN_FACE_PX = 40
MAX_FACES_PER_PHOTO = 50

BATCH_SIZE = 20

# After a failed import, do not retry on every status poll.
_UNAVAILABLE_RETRY_SECONDS = 300


class FaceSearchUnavailable(Exception):
    """The face_recognition library (dlib) is not installed on this server."""


_library = None
_unavailable_until = 0.0


def _load_library():
    global _library, _unavailable_until

    if _library is not None:
        return _library

    if time.monotonic() < _unavailable_until:
        raise FaceSearchUnavailable("face_recognition is not installed.")

    try:
        import face_recognition
    except (ImportError, SystemExit):
        # face_recognition calls quit() when its model package is missing,
        # which raises SystemExit rather than ImportError.
        _unavailable_until = time.monotonic() + _UNAVAILABLE_RETRY_SECONDS
        raise FaceSearchUnavailable("face_recognition is not installed.")

    _library = face_recognition
    return _library


def face_search_available() -> bool:
    try:
        _load_library()
        return True
    except FaceSearchUnavailable:
        return False


def organizer_has_face_search(organizer) -> bool:
    """Face search is part of the QR-code feature of the plan."""

    from memberships.utils import get_effective_plan

    plan = get_effective_plan(organizer)

    return bool(plan and plan.qr_code_enabled)


# ---------------------------------------------------------------------
# Scanning one photo
# ---------------------------------------------------------------------

def _load_image_array(media):
    """The stored photo as an upright RGB array, at most SCAN_MAX_EDGE px."""

    import numpy as np
    from PIL import Image, ImageOps

    media.file.open("rb")

    try:
        image = Image.open(media.file)

        if image.width * image.height > MAX_SCAN_PIXELS:
            raise ValueError("image has too many pixels")

        # Phones store portraits sideways plus a rotate flag; the detector
        # ignores the flag, so rotate first or no face is found.
        image = ImageOps.exif_transpose(image).convert("RGB")
        image.thumbnail((SCAN_MAX_EDGE, SCAN_MAX_EDGE))

        return np.array(image)
    finally:
        media.file.close()


def _encode_faces(library, image_array) -> list[list[float]]:
    """One 128-number encoding per usable face (largest first)."""

    # Each location is (top, right, bottom, left).
    locations = [
        box
        for box in library.face_locations(image_array)
        if min(box[2] - box[0], box[1] - box[3]) >= MIN_FACE_PX
    ]

    locations.sort(key=lambda box: (box[2] - box[0]) * (box[1] - box[3]), reverse=True)
    locations = locations[:MAX_FACES_PER_PHOTO]

    if not locations:
        return []

    # Same settings as the selfie in qr_codes/services.py - both sides of a
    # comparison must be encoded the same way.
    return [[float(value) for value in encoding] for encoding in library.face_encodings(image_array, locations)]


def _scan_one(library, media) -> tuple[str, list[list[float]]]:
    """(status, encodings). A photo that cannot be read is FAILED, never an
    exception: one bad file must not stop the rest of the batch."""

    from .models import GalleryMedia

    try:
        return GalleryMedia.FaceScanStatus.PROCESSED, _encode_faces(library, _load_image_array(media))
    except Exception:
        logger.warning("Face scan failed for gallery media %s.", getattr(media, "pk", "?"), exc_info=True)
        return GalleryMedia.FaceScanStatus.FAILED, []


def scan_media(media_id: int) -> str | None:
    """Scan one waiting photo. Returns the new status, or None when there
    was nothing to do (already scanned, deleted, a video, or another
    process is scanning it right now).

    The row stays locked while it is scanned, so two web workers (or a
    worker and the management command) never process the same photo.
    Raises FaceSearchUnavailable - without touching the photo - when the
    library is missing.
    """

    from .models import FaceEmbedding, GalleryMedia

    library = _load_library()

    with transaction.atomic():
        media = (
            GalleryMedia.objects.select_for_update(skip_locked=True)
            .filter(
                pk=media_id,
                media_type=GalleryMedia.MediaType.IMAGE,
                face_scan_status=GalleryMedia.FaceScanStatus.PENDING,
            )
            .first()
        )

        if media is None:
            return None

        status, encodings = _scan_one(library, media)

        # Replace, never append: scanning the same photo twice must not
        # leave duplicate faces.
        FaceEmbedding.objects.filter(media=media).delete()
        FaceEmbedding.objects.bulk_create(
            [FaceEmbedding(media=media, encoding_json=json.dumps(encoding)) for encoding in encodings]
        )

        media.face_scan_status = status
        media.save(update_fields=["face_scan_status", "updated_at"])

    return status


# ---------------------------------------------------------------------
# Queue
# ---------------------------------------------------------------------

def pending_queryset(event_id: int | None = None, respect_plan: bool = True):
    """Photos waiting to be scanned. With respect_plan (the default) only
    photos of organizers whose plan includes face search are returned, so
    a free-plan gallery does not use up server time."""

    from django.contrib.auth import get_user_model

    from .models import GalleryMedia

    queryset = GalleryMedia.objects.filter(
        media_type=GalleryMedia.MediaType.IMAGE,
        face_scan_status=GalleryMedia.FaceScanStatus.PENDING,
    )

    if event_id is not None:
        queryset = queryset.filter(event_id=event_id)

    if respect_plan:
        organizer_ids = set(queryset.values_list("event__organizer_id", flat=True).distinct())
        allowed = [
            user.pk
            for user in get_user_model().objects.filter(pk__in=organizer_ids)
            if organizer_has_face_search(user)
        ]
        queryset = queryset.filter(event__organizer_id__in=allowed)

    return queryset


def scan_pending(limit: int | None = BATCH_SIZE, event_id: int | None = None, respect_plan: bool = True) -> dict:
    """Scan up to `limit` waiting photos (None = all). Returns counts."""

    from .models import GalleryMedia

    ids = pending_queryset(event_id, respect_plan).order_by("id").values_list("id", flat=True)
    ids = list(ids if limit is None else ids[:limit])

    counts = {"attempted": 0, "processed": 0, "failed": 0}

    for media_id in ids:
        status = scan_media(media_id)

        if status is None:
            continue

        counts["attempted"] += 1

        if status == GalleryMedia.FaceScanStatus.FAILED:
            counts["failed"] += 1
        else:
            counts["processed"] += 1

    return counts


def retry_failed(event_id: int | None = None) -> int:
    """Put photos that failed back in the queue. Returns how many."""

    from .models import GalleryMedia

    queryset = GalleryMedia.objects.filter(
        media_type=GalleryMedia.MediaType.IMAGE,
        face_scan_status=GalleryMedia.FaceScanStatus.FAILED,
    )

    if event_id is not None:
        queryset = queryset.filter(event_id=event_id)

    return queryset.update(face_scan_status=GalleryMedia.FaceScanStatus.PENDING)


# ---------------------------------------------------------------------
# Background runner
# ---------------------------------------------------------------------

_runner_lock = threading.Lock()


def background_scan_enabled() -> bool:
    return config("FACE_SCAN_BACKGROUND", default=True, cast=bool)


def start_background_scan() -> bool:
    """Scan waiting photos in a background thread of this web process.

    Only one such thread runs per process; asking again while it is busy
    does nothing, because the running thread keeps looking for newly
    waiting photos until none are left. Returns True if a thread started.
    """

    if not background_scan_enabled():
        return False

    if not _runner_lock.acquire(blocking=False):
        return False

    try:
        threading.Thread(target=_run_background, name="face-scan", daemon=True).start()
    except Exception:
        _runner_lock.release()
        raise

    return True


def _run_background() -> None:
    attempted_total = 0

    try:
        try:
            while True:
                result = scan_pending(limit=BATCH_SIZE)
                attempted_total += result["attempted"]

                if result["attempted"] == 0:
                    break
        except FaceSearchUnavailable:
            logger.info("Face scan skipped: face_recognition is not installed.")
        except Exception:
            logger.exception("Background face scan stopped unexpectedly.")
        finally:
            _runner_lock.release()

        # A photo uploaded just as the loop above ended would otherwise wait
        # for the next trigger.
        if attempted_total:
            try:
                if pending_queryset().exists():
                    start_background_scan()
            except Exception:
                logger.exception("Could not check for newly uploaded photos.")
    finally:
        connections.close_all()


# ---------------------------------------------------------------------
# Status for the organizer
# ---------------------------------------------------------------------

def get_face_scan_summary(event) -> dict:
    from django.db.models import Count, Q

    from .models import FaceEmbedding, GalleryMedia

    status = GalleryMedia.FaceScanStatus

    counts = event.gallery_media.filter(media_type=GalleryMedia.MediaType.IMAGE).aggregate(
        total=Count("id"),
        pending=Count("id", filter=Q(face_scan_status=status.PENDING)),
        processed=Count("id", filter=Q(face_scan_status=status.PROCESSED)),
        failed=Count("id", filter=Q(face_scan_status=status.FAILED)),
    )

    return {
        **counts,
        "faces_found": FaceEmbedding.objects.filter(media__event=event).count(),
        "available": face_search_available(),
        "plan_enabled": organizer_has_face_search(event.organizer),
    }
