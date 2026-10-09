import logging
from datetime import date

from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import transaction
from django.utils import timezone
from memberships.utils import LimitExceededError, check_event_limit

from .models import Event

logger = logging.getLogger(__name__)


class EventError(Exception):
    """Raised when an event action cannot be completed."""

    def __init__(self, message: str, code: str = "event_error"):
        self.message = message
        self.code = code
        super().__init__(message)


# Which status an event may move to from each status. Creating always starts
# at DRAFT or PUBLISHED (enforced in the serializer).
ALLOWED_STATUS_TRANSITIONS = {
    Event.Status.DRAFT: {Event.Status.PUBLISHED, Event.Status.CANCELLED},
    Event.Status.PUBLISHED: {
        Event.Status.DRAFT,
        Event.Status.COMPLETED,
        Event.Status.CANCELLED,
    },
    Event.Status.COMPLETED: {Event.Status.PUBLISHED},
    Event.Status.CANCELLED: {Event.Status.DRAFT, Event.Status.PUBLISHED},
}


def today() -> date:
    """Today's date in the project time zone."""

    if settings.USE_TZ:
        return timezone.localdate()

    return date.today()


def get_organizer_event_count(organizer) -> int:
    """Return the number of non-cancelled events owned by this organizer."""

    return Event.objects.filter(
        organizer=organizer
    ).exclude(
        status=Event.Status.CANCELLED
    ).count()


def _lock_organizer(organizer):
    """Row-lock the organizer so two simultaneous requests cannot both pass
    the plan's event-limit check."""

    user_model = get_user_model()

    return user_model.objects.select_for_update().get(pk=organizer.pk)


def _enforce_event_limit(organizer) -> None:
    try:
        check_event_limit(organizer, get_organizer_event_count(organizer))

    except LimitExceededError as error:
        raise EventError(error.message, code=error.code)


def _delete_stored_file(storage, name) -> None:
    """Best-effort removal of a file from storage (never breaks a request)."""

    if not name:
        return

    try:
        storage.delete(name)

    except Exception:  # noqa: BLE001 - storage errors must not fail the API call
        logger.warning("Could not delete stored file %s", name, exc_info=True)


def create_event(organizer, validated_data: dict) -> Event:
    """Create a new event for the organizer, enforcing their plan's event limit.

    The organizer row is locked for the duration of the check + insert, so
    parallel requests cannot exceed the plan limit. Default guest categories
    are seeded in the same transaction.
    """

    with transaction.atomic():
        locked_organizer = _lock_organizer(organizer)

        _enforce_event_limit(locked_organizer)

        event = Event.objects.create(
            organizer=locked_organizer,
            **validated_data,
        )

        # Local import avoids a circular import at module load time.
        from guests.services import seed_default_categories

        seed_default_categories(event)

    return event


def update_event(event: Event, validated_data: dict) -> Event:
    """Apply partial updates to an existing event.

    * Re-activating a CANCELLED event counts against the plan limit again,
      so cancelling + creating + un-cancelling cannot bypass it.
    * A replaced / removed cover image is deleted from storage.
    """

    old_status = event.status
    new_status = validated_data.get("status", old_status)

    old_cover_name = event.cover_image.name if event.cover_image else None
    storage = event.cover_image.storage

    with transaction.atomic():
        if (
            old_status == Event.Status.CANCELLED
            and new_status != Event.Status.CANCELLED
        ):
            locked_organizer = _lock_organizer(event.organizer)
            _enforce_event_limit(locked_organizer)

        for field, value in validated_data.items():
            setattr(event, field, value)

        event.save()

    if "cover_image" in validated_data:
        new_cover_name = event.cover_image.name if event.cover_image else None

        if old_cover_name and old_cover_name != new_cover_name:
            _delete_stored_file(storage, old_cover_name)

    return event


def delete_event(event: Event) -> None:
    """Permanently delete an event (guests, invitations etc. cascade) and its
    cover image file."""

    cover_name = event.cover_image.name if event.cover_image else None
    storage = event.cover_image.storage

    with transaction.atomic():
        event.delete()

    _delete_stored_file(storage, cover_name)