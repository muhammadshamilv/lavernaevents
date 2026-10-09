from common.models import TimeStampedModel
from django.db import models


class GuestCategory(TimeStampedModel):
    """An organizer-defined grouping of guests within one event.

    Created per event, not platform-wide. A default set (Family, Friends,
    Relatives, Special Guest, VIP) is seeded on event creation (see
    guests/services.py); the organizer can rename, add or delete freely.
    """

    event = models.ForeignKey(
        "events.Event",
        on_delete=models.CASCADE,
        related_name="guest_categories",
    )

    name = models.CharField(
        max_length=80,
    )

    display_order = models.PositiveIntegerField(
        default=0,
    )

    class Meta:
        db_table = "guest_categories"
        ordering = ["display_order", "name"]
        constraints = [
            models.UniqueConstraint(
                fields=["event", "name"],
                name="unique_category_name_per_event",
            )
        ]

    def __str__(self) -> str:
        return f"{self.name} ({self.event.name})"


class Guest(TimeStampedModel):
    """A guest invited to a specific event."""

    class InvitationStatus(models.TextChoices):
        NOT_SENT = "NOT_SENT", "Not Sent"
        SENT = "SENT", "Sent"
        FAILED = "FAILED", "Failed"

    class ResponseStatus(models.TextChoices):
        PENDING = "PENDING", "Pending"
        ACCEPTED = "ACCEPTED", "Accepted"
        REJECTED = "REJECTED", "Rejected"
        MAYBE = "MAYBE", "Maybe"

    event = models.ForeignKey(
        "events.Event",
        on_delete=models.CASCADE,
        related_name="guests",
    )

    # Nullable + SET_NULL: deleting a category never deletes its guests,
    # they just become uncategorized again.
    category = models.ForeignKey(
        GuestCategory,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="guests",
    )

    name = models.CharField(
        max_length=150,
    )

    mobile_number = models.CharField(
        max_length=20,
    )

    email = models.EmailField(
        blank=True,
        help_text="Optional. Required only if the organizer sends this guest's invitation via email.",
    )

    family_member_count = models.PositiveIntegerField(
        default=3,
        help_text="Used for expected attendance calculation.",
    )

    # Cheap overall summary, updated by invitations/services.py. The detailed
    # per-channel history lives in the notification logs.
    invitation_status = models.CharField(
        max_length=20,
        choices=InvitationStatus.choices,
        default=InvitationStatus.NOT_SENT,
    )

    response_status = models.CharField(
        max_length=20,
        choices=ResponseStatus.choices,
        default=ResponseStatus.PENDING,
    )

    responded_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When the guest submitted their Accept/Reject/Maybe response.",
    )

    notes = models.CharField(
        max_length=255,
        blank=True,
    )

    class Meta:
        db_table = "guests"
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["event", "mobile_number"],
                name="unique_guest_per_event",
            )
        ]
        indexes = [
            models.Index(
                fields=["event", "response_status"],
                name="guests_event_response_idx",
            ),
            models.Index(
                fields=["event", "invitation_status"],
                name="guests_event_invite_idx",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.name} ({self.event.name})"
