from decouple import config
from rest_framework import serializers
from users.models import User
from users.services import get_user_by_mobile

from .models import PhotographerEventAccess


class GrantPhotographerAccessSerializer(serializers.Serializer):
    """Validates an organizer's request to grant a photographer access to one event.

    Takes the photographer's mobile number as the organizer would type it
    (9876543210, +91 98765 43210 ...). The lookup goes through the same
    matching the login uses, so any normal way of writing the number finds
    the account.
    """

    mobile_number = serializers.CharField(max_length=30)
    expires_at = serializers.DateTimeField(required=False, allow_null=True)

    def validate_mobile_number(self, value: str) -> str:
        user = get_user_by_mobile(value.strip())

        # One message for "no such account" and "account is not a
        # photographer" - the organizer learns what to do next, and no more
        # than that about other people's accounts.
        if user is None or user.role != User.Role.PHOTOGRAPHER or not user.is_active:
            raise serializers.ValidationError(
                "No photographer account found with this mobile number. "
                "The photographer must register as a photographer first."
            )

        self.context["photographer"] = user

        return value


class PhotographerSummarySerializer(serializers.ModelSerializer):
    """Minimal photographer identity - shown to organizers reviewing/granting access."""

    class Meta:
        model = User
        fields = ("id", "full_name", "mobile_number", "email")


class EventSummarySerializer(serializers.Serializer):
    """Minimal event identity - shown to photographers browsing their granted events."""

    id = serializers.IntegerField()
    name = serializers.CharField()
    event_type = serializers.CharField()
    event_date = serializers.DateField()
    event_time = serializers.TimeField()
    venue_name = serializers.CharField()
    cover_image = serializers.SerializerMethodField()

    def get_cover_image(self, event) -> str | None:
        if not event.cover_image:
            return None

        url = event.cover_image.url

        if url.startswith(("http://", "https://")):
            return url

        # Behind a proxy the request host is the internal one; prefer the
        # public address of the backend.
        base = config("PUBLIC_BACKEND_URL", default="").rstrip("/")
        request = self.context.get("request")

        if not base and request is not None:
            base = request.build_absolute_uri("/").rstrip("/")

        return f"{base}{url}"


class PhotographerAccessSerializer(serializers.ModelSerializer):
    """Full access-grant record, as shown to the organizer managing an event's photographers."""

    photographer = PhotographerSummarySerializer(read_only=True)
    is_currently_valid = serializers.SerializerMethodField()

    class Meta:
        model = PhotographerEventAccess
        fields = (
            "id",
            "photographer",
            "granted_by",
            "is_active",
            "expires_at",
            "is_currently_valid",
            "created_at",
        )
        read_only_fields = fields

    def get_is_currently_valid(self, obj: PhotographerEventAccess) -> bool:
        return obj.is_currently_valid()


class PhotographerEventGrantSerializer(serializers.ModelSerializer):
    """A single granted-event entry, as shown to the photographer themself."""

    event = EventSummarySerializer(read_only=True)
    is_currently_valid = serializers.SerializerMethodField()

    class Meta:
        model = PhotographerEventAccess
        fields = (
            "id",
            "event",
            "expires_at",
            "is_currently_valid",
            "created_at",
        )
        read_only_fields = fields

    def get_is_currently_valid(self, obj: PhotographerEventAccess) -> bool:
        return obj.is_currently_valid()
