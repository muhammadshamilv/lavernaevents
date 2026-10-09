from datetime import time

from rest_framework import serializers

from .models import Event
from .services import ALLOWED_STATUS_TRANSITIONS, today


class BlankToNoneTimeField(serializers.TimeField):
    """A TimeField that treats an empty string as "not set".

    Browsers / the React form send "" for an untouched optional time input.
    """

    def run_validation(self, data=serializers.empty):
        if data == "":
            data = None

        return super().run_validation(data)


class EventSerializer(serializers.ModelSerializer):
    """Serializer for creating, updating, and reading events."""

    event_end_time = BlankToNoneTimeField(required=False, allow_null=True)

    class Meta:
        model = Event
        fields = (
            "id",
            "name",
            "event_type",
            "custom_event_type_label",
            "host_name",
            "description",
            "event_date",
            "event_time",
            "event_end_time",
            "venue_name",
            "address",
            "google_maps_link",
            "cover_image",
            "status",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "id",
            "created_at",
            "updated_at",
        )

    # ----- field level -------------------------------------------------

    def validate_name(self, value: str) -> str:
        value = value.strip()

        if not value:
            raise serializers.ValidationError("Event name is required.")

        return value

    def validate_event_date(self, value):
        """A new event (or a date being changed) can't be in the past.

        An unchanged date on an existing event is always accepted, so an
        organizer can still edit / complete an event after its day has come.
        """

        is_new = self.instance is None
        changed = not is_new and value != self.instance.event_date

        if (is_new or changed) and value < today():
            raise serializers.ValidationError("Event date can't be in the past.")

        return value

    def validate_google_maps_link(self, value: str) -> str:
        value = (value or "").strip()

        if value and not value.lower().startswith(("http://", "https://")):
            raise serializers.ValidationError("Enter a valid http(s) link.")

        return value

    def validate_status(self, value: str) -> str:
        """New events start as Draft or Published; existing ones follow the
        allowed status transitions."""

        if self.instance is None:
            if value not in (Event.Status.DRAFT, Event.Status.PUBLISHED):
                raise serializers.ValidationError(
                    "A new event can only be saved as Draft or Published."
                )

            return value

        current = self.instance.status

        if value != current and value not in ALLOWED_STATUS_TRANSITIONS.get(
            current, set()
        ):
            raise serializers.ValidationError(
                f"An event can't move from {current.title()} to {value.title()}."
            )

        return value

    # ----- object level ------------------------------------------------

    # There is no end *date*, so an end time earlier than the start time is
    # read as "after midnight" - fine for a wedding that finishes at 1 AM, but
    # not for one that "ends" at 10 AM after a 6 PM start.
    OVERNIGHT_LATEST_END = time(6, 0)

    def _validate_end_time(self, attrs: dict) -> None:
        start = attrs.get("event_time", getattr(self.instance, "event_time", None))
        end = attrs.get("event_end_time", getattr(self.instance, "event_end_time", None))

        if not start or not end:
            return

        if end == start:
            raise serializers.ValidationError(
                {"event_end_time": "The end time must be different from the start time."}
            )

        if end < start and end > self.OVERNIGHT_LATEST_END:
            raise serializers.ValidationError(
                {"event_end_time": "The end time can't be before the start time."}
            )

    def validate(self, attrs: dict) -> dict:
        """Require a custom label when event_type is CUSTOM."""

        event_type = attrs.get(
            "event_type",
            getattr(self.instance, "event_type", None),
        )

        custom_label = attrs.get(
            "custom_event_type_label",
            getattr(self.instance, "custom_event_type_label", ""),
        )

        if event_type == Event.EventType.CUSTOM and not (custom_label or "").strip():
            raise serializers.ValidationError(
                {
                    "custom_event_type_label": (
                        "This field is required when event type is Custom."
                    )
                }
            )

        self._validate_end_time(attrs)

        # The label only means something for CUSTOM events.
        if event_type != Event.EventType.CUSTOM and "event_type" in attrs:
            attrs["custom_event_type_label"] = ""

        return attrs


class EventListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for listing events (excludes heavy/rarely-needed fields)."""

    class Meta:
        model = Event
        fields = (
            "id",
            "name",
            "event_type",
            "custom_event_type_label",
            "event_date",
            "event_time",
            "event_end_time",
            "venue_name",
            "status",
            "cover_image",
        )
        read_only_fields = fields