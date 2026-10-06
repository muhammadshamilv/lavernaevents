from rest_framework import serializers

from .models import Event


class EventSerializer(serializers.ModelSerializer):
    """Serializer for creating, updating, and reading events."""

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

        if event_type == Event.EventType.CUSTOM and not custom_label.strip():
            raise serializers.ValidationError(
                {
                    "custom_event_type_label": (
                        "This field is required when event type is Custom."
                    )
                }
            )

        return attrs

    def validate_name(self, value: str) -> str:
        """Validate and normalize the event name."""

        value = value.strip()

        if not value:
            raise serializers.ValidationError(
                "Event name is required."
            )

        return value


class EventListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for listing events (excludes heavy/rarely-needed fields)."""

    class Meta:
        model = Event
        fields = (
            "id",
            "name",
            "event_type",
            "event_date",
            "event_time",
            "event_end_time",
            "venue_name",
            "status",
            "cover_image",
        )
        read_only_fields = fields