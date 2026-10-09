from common.models import TimeStampedModel
from common.validators import validate_image_extension, validate_image_max_5mb
from django.db import models


class Event(TimeStampedModel):
    """An event created and managed by an organizer."""

    class EventType(models.TextChoices):
        WEDDING = "WEDDING", "Wedding"
        RECEPTION = "RECEPTION", "Reception"
        ENGAGEMENT = "ENGAGEMENT", "Engagement"
        BIRTHDAY = "BIRTHDAY", "Birthday"
        ANNIVERSARY = "ANNIVERSARY", "Anniversary"
        HOUSEWARMING = "HOUSEWARMING", "Housewarming"
        CORPORATE = "CORPORATE", "Corporate Event"
        CONFERENCE = "CONFERENCE", "Conference"
        SEMINAR = "SEMINAR", "Seminar"
        RELIGIOUS = "RELIGIOUS", "Religious Event"
        FAMILY = "FAMILY", "Family Function"
        COMMUNITY = "COMMUNITY", "Community Program"
        PRIVATE = "PRIVATE", "Private Event"
        CUSTOM = "CUSTOM", "Custom Event"

    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Draft"
        PUBLISHED = "PUBLISHED", "Published"
        CANCELLED = "CANCELLED", "Cancelled"
        COMPLETED = "COMPLETED", "Completed"

    organizer = models.ForeignKey(
        "users.User",
        on_delete=models.CASCADE,
        related_name="events",
    )

    name = models.CharField(
        max_length=200,
    )

    event_type = models.CharField(
        max_length=20,
        choices=EventType.choices,
    )

    custom_event_type_label = models.CharField(
        max_length=100,
        blank=True,
        help_text="Used only when event_type is CUSTOM.",
    )

    host_name = models.CharField(
        max_length=150,
        blank=True,
        help_text="Name displayed on invitations as the host, if different from the organizer.",
    )

    description = models.TextField(
        blank=True,
    )

    event_date = models.DateField()

    event_time = models.TimeField()

    event_end_time = models.TimeField(
        null=True,
        blank=True,
        help_text=(
            "Optional. Shown to guests as a From - To time range. May be "
            "earlier than the start time for events that run past midnight."
        ),
    )

    venue_name = models.CharField(
        max_length=200,
        blank=True,
    )

    address = models.TextField(
        blank=True,
    )

    google_maps_link = models.URLField(
        blank=True,
    )

    cover_image = models.ImageField(
        upload_to="events/covers/",
        blank=True,
        null=True,
        validators=[validate_image_extension, validate_image_max_5mb],
    )

    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.DRAFT,
    )

    class Meta:
        db_table = "events"
        ordering = ["-event_date", "-created_at"]
        indexes = [
            models.Index(
                fields=["organizer", "-event_date"],
                name="events_org_date_idx",
            ),
            models.Index(
                fields=["organizer", "status"],
                name="events_org_status_idx",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.name} ({self.organizer.mobile_number})"