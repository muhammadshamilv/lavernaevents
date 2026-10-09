from rest_framework import serializers

from .models import Guest, GuestCategory
from .phone import INVALID_MOBILE_MESSAGE, is_valid_guest_mobile, normalize_guest_mobile


class GuestCategorySerializer(serializers.ModelSerializer):
    """Serializer for creating, updating, and reading an event's guest categories."""

    guest_count = serializers.SerializerMethodField()

    class Meta:
        model = GuestCategory
        fields = (
            "id",
            "name",
            "display_order",
            "guest_count",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "guest_count", "created_at", "updated_at")

    def get_guest_count(self, obj: GuestCategory) -> int:
        # The list view annotates `guest_total` (one query for all rows);
        # single objects fall back to a count.
        annotated = getattr(obj, "guest_total", None)

        return annotated if annotated is not None else obj.guests.count()

    def validate_name(self, value: str) -> str:
        value = value.strip()

        if not value:
            raise serializers.ValidationError("Category name is required.")

        return value


class GuestSerializer(serializers.ModelSerializer):
    """Serializer for creating, updating, and reading guests."""

    category_name = serializers.CharField(source="category.name", read_only=True, default=None)
    channel_status = serializers.SerializerMethodField()

    class Meta:
        model = Guest
        fields = (
            "id",
            "category",
            "category_name",
            "name",
            "mobile_number",
            "email",
            "family_member_count",
            "invitation_status",
            "channel_status",
            "response_status",
            "responded_at",
            "notes",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "id",
            "category_name",
            "invitation_status",
            "channel_status",
            "response_status",
            "responded_at",
            "created_at",
            "updated_at",
        )

    def get_channel_status(self, obj: Guest) -> dict:
        """Per-channel delivery state for this guest: {channel: status}.

        A successful send on a channel always wins over a later failed
        retry; a call still in progress ("CALLING") wins over a failure;
        otherwise the latest attempt's status is shown. Channels never
        tried are simply absent.
        """

        if obj.pk is None:
            return {}

        rank = {"SENT": 3, "CALLING": 2}
        result: dict[str, str] = {}

        # notification_logs is ordered newest first (NotificationLog.Meta)
        # and prefetched by the list view.
        for log in obj.notification_logs.all():
            current = result.get(log.channel)

            if current is None or rank.get(log.status, 0) > rank.get(current, 0):
                result[log.channel] = log.status

        return result

    def validate_name(self, value: str) -> str:
        value = value.strip()

        if not value:
            raise serializers.ValidationError("Guest name is required.")

        return value

    def validate_mobile_number(self, value: str) -> str:
        """Normalize to the stored form and check the length."""

        value = normalize_guest_mobile(value)

        if not value:
            raise serializers.ValidationError("Mobile number is required.")

        if not is_valid_guest_mobile(value):
            raise serializers.ValidationError(INVALID_MOBILE_MESSAGE)

        return value

    def validate_email(self, value: str) -> str:
        return value.strip().lower()

    def validate_family_member_count(self, value: int) -> int:
        if value < 0:
            raise serializers.ValidationError("Family member count cannot be negative.")

        if value > 50:
            raise serializers.ValidationError(
                "Family member count seems unusually high. Please double check."
            )

        return value

    def validate_category(self, value):
        """Ensure the chosen category belongs to the same event as this guest."""

        event = None

        if self.instance is not None:
            event = self.instance.event
        else:
            view = self.context.get("view")
            event = getattr(view, "event", None) if view else None

        if value is not None and event is not None and value.event_id != event.id:
            raise serializers.ValidationError(
                "This category does not belong to this event."
            )

        return value


class CSVImportResultSerializer(serializers.Serializer):
    """Serializer for reporting the result of a CSV guest import."""

    created_count = serializers.IntegerField()
    skipped_count = serializers.IntegerField()
    skipped_rows = serializers.ListField(child=serializers.DictField())


# --------------------------------------------------
# Contact Import
# --------------------------------------------------

class ContactImportRowSerializer(serializers.Serializer):
    """One reviewed, editable row from the frontend's Contact Picker flow.

    Held to the same standard as a manually-added guest.
    """

    name = serializers.CharField(max_length=150)
    mobile_number = serializers.CharField(max_length=30)
    email = serializers.EmailField(required=False, allow_blank=True, default="")
    category = serializers.PrimaryKeyRelatedField(
        queryset=GuestCategory.objects.all(),
        required=False,
        allow_null=True,
        default=None,
    )
    family_member_count = serializers.IntegerField(
        required=False, default=3, min_value=0, max_value=50
    )

    def validate_name(self, value: str) -> str:
        value = value.strip()

        if not value:
            raise serializers.ValidationError("Name is required.")

        return value

    def validate_mobile_number(self, value: str) -> str:
        value = normalize_guest_mobile(value)

        if not is_valid_guest_mobile(value):
            raise serializers.ValidationError(INVALID_MOBILE_MESSAGE)

        return value

    def validate_email(self, value: str) -> str:
        return value.strip().lower()


class ContactImportRequestSerializer(serializers.Serializer):
    """The full batch submitted from the Contact Import review table."""

    guests = ContactImportRowSerializer(many=True)

    def validate_guests(self, value):
        if not value:
            raise serializers.ValidationError("At least one guest is required.")

        if len(value) > 500:
            raise serializers.ValidationError(
                "You can import at most 500 contacts at once. Please split into smaller batches."
            )

        return value


class ContactImportResultSerializer(serializers.Serializer):
    """Serializer for reporting the result of a bulk contact import."""

    created_count = serializers.IntegerField()
    skipped_count = serializers.IntegerField()
    skipped_rows = serializers.ListField(child=serializers.DictField())
