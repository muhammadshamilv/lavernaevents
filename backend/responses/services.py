from django.db import transaction
from django.utils import timezone
from guests.models import Guest
from invitations.models import Invitation

# A response token is a urlsafe random string; anything much longer is not
# one of ours, so it is rejected before touching the database.
MAX_TOKEN_LENGTH = 128


class ResponseError(Exception):
    """Raised when a guest response action cannot be completed."""

    def __init__(self, message: str, code: str = "response_error"):
        self.message = message
        self.code = code
        super().__init__(message)


def get_invitation_by_token(response_token: str) -> Invitation:
    """Return the invitation matching this response token.

    Raises ResponseError if no invitation matches -- this covers both a
    genuinely invalid token and someone guessing a random string, and
    intentionally gives no hint about which case it is.
    """

    invitation = None

    if response_token and len(response_token) <= MAX_TOKEN_LENGTH:
        invitation = (
            Invitation.objects.select_related("event", "event__organizer", "guest", "template")
            .filter(response_token=response_token)
            .first()
        )

    if invitation is None:
        raise ResponseError(
            "This invitation link is invalid or has expired.",
            code="invalid_token",
        )

    return invitation


def responses_open(event) -> bool:
    """Guests can answer (and change their answer) until the organizer
    cancels the event or marks it completed."""

    return event.status not in (event.Status.CANCELLED, event.Status.COMPLETED)


VALID_RESPONSES = {
    "ACCEPTED": Guest.ResponseStatus.ACCEPTED,
    "REJECTED": Guest.ResponseStatus.REJECTED,
    "MAYBE": Guest.ResponseStatus.MAYBE,
}


def submit_guest_response(response_token: str, response_value: str) -> Guest:
    """Record a guest's Accept/Reject/Maybe response using their invitation token.

    A guest may change their answer while the event is still open (people
    tap the wrong button, or their plans change). Raises ResponseError if
    the token is invalid, the value is not ACCEPTED/REJECTED/MAYBE, or the
    event is cancelled / completed.

    The guest row is locked for the update so two quick taps (or two
    devices) cannot interleave, and the same answer sent twice does not
    move ``responded_at``.
    """

    if response_value not in VALID_RESPONSES:
        raise ResponseError(
            "Response must be one of: ACCEPTED, REJECTED, MAYBE.",
            code="invalid_response_value",
        )

    invitation = get_invitation_by_token(response_token)

    if not responses_open(invitation.event):
        raise ResponseError(
            "Responses are closed for this event.",
            code="event_not_active",
        )

    new_status = VALID_RESPONSES[response_value]

    with transaction.atomic():
        guest = Guest.objects.select_for_update().get(pk=invitation.guest_id)

        if guest.response_status == new_status:
            return guest

        guest.response_status = new_status
        guest.responded_at = timezone.now()
        guest.save(update_fields=["response_status", "responded_at", "updated_at"])

    return guest