from django.db.models import Q
from django.utils import timezone
from events.models import Event

from .models import PhotographerEventAccess

# More than this many people with live access to one gallery is almost
# certainly a mistake (or a shared link being passed around).
MAX_ACTIVE_PHOTOGRAPHERS_PER_EVENT = 20


class PhotographerAccessError(Exception):
    """Raised when a photographer-access action cannot be completed."""

    def __init__(self, message: str, code: str = "access_error"):
        self.message = message
        self.code = code
        super().__init__(message)


def _valid_grants():
    """Grants that are switched on AND not past their expiry - one query."""

    return PhotographerEventAccess.objects.filter(is_active=True).filter(
        Q(expires_at__isnull=True) | Q(expires_at__gt=timezone.now())
    )


def ensure_photographer_access_allowed(organizer) -> None:
    """Inviting photographers is a plan feature."""

    from memberships.utils import get_effective_plan

    plan = get_effective_plan(organizer)

    if plan is None:
        raise PhotographerAccessError(
            "You need an active plan to invite photographers.",
            code="no_active_plan",
        )

    if not plan.photographer_access_enabled:
        raise PhotographerAccessError(
            "Photographer access is not included in your current plan. Upgrade to invite photographers.",
            code="photographer_access_not_enabled",
        )


def grant_access(event: Event, photographer, granted_by, expires_at=None) -> PhotographerEventAccess:
    """Grant (or re-activate) a photographer's access to an event.

    A grant that already exists for this (event, photographer) pair - even
    a revoked one - is reused and reactivated rather than creating a second
    row (the model enforces one grant per pair).
    """

    if expires_at is not None and expires_at <= timezone.now():
        raise PhotographerAccessError(
            "The access end time must be in the future.",
            code="invalid_expiry",
        )

    ensure_photographer_access_allowed(granted_by)

    already_valid = _valid_grants().filter(event=event, photographer=photographer).exists()

    if (
        not already_valid
        and _valid_grants().filter(event=event).count() >= MAX_ACTIVE_PHOTOGRAPHERS_PER_EVENT
    ):
        raise PhotographerAccessError(
            f"An event can have at most {MAX_ACTIVE_PHOTOGRAPHERS_PER_EVENT} photographers with access. "
            "Revoke someone first.",
            code="too_many_photographers",
        )

    grant, _created = PhotographerEventAccess.objects.update_or_create(
        event=event,
        photographer=photographer,
        defaults={
            "granted_by": granted_by,
            "is_active": True,
            "expires_at": expires_at,
        },
    )

    return grant


def revoke_access(grant: PhotographerEventAccess) -> PhotographerEventAccess:
    """Revoke a photographer's access to an event. The record is kept, so
    the organizer retains a history and can re-grant later."""

    if grant.is_active:
        grant.is_active = False
        grant.save(update_fields=["is_active", "updated_at"])

    return grant


def get_events_for_photographer(photographer):
    """The grants this photographer can use right now, nearest event first."""

    return list(
        _valid_grants()
        .filter(photographer=photographer)
        .select_related("event")
        .order_by("event__event_date", "event__event_time", "id")
    )


def check_photographer_event_access(photographer, event: Event) -> PhotographerEventAccess:
    """Raise PhotographerAccessError unless this photographer currently has
    valid access to this event. Returns the grant on success."""

    grant = _valid_grants().filter(photographer=photographer, event=event).first()

    if grant is None:
        raise PhotographerAccessError(
            "You do not have access to this event's gallery.",
            code="no_access",
        )

    return grant
