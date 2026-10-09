from gallery.models import GalleryMedia
from invitations.models import InvitationTemplate
from memberships.models import MembershipPlan
from memberships.topup_models import PlatformChannelPool, PlatformPoolTopup, TopupPack
from common.validators import validate_image_content
from rest_framework import serializers
from users.models import User
from users.services import get_user_by_mobile

from .helpers import normalize_admin_mobile

MAX_TEMPLATE_IMAGE_BYTES = 10 * 1024 * 1024
MAX_POOL_TOPUP = 10_000_000


# --------------------------------------------------
# Dashboard
# --------------------------------------------------

class AdminChannelUsageSerializer(serializers.Serializer):
    """One configured platform channel pool, as shown on the dashboard."""

    channel = serializers.CharField()
    channel_display = serializers.CharField()
    total_capacity = serializers.IntegerField()
    used = serializers.IntegerField()
    remaining = serializers.IntegerField()
    is_low = serializers.BooleanField()
    is_exhausted = serializers.BooleanField()


class AdminDashboardStatsSerializer(serializers.Serializer):
    """Top-line numbers shown on the admin dashboard."""

    total_users = serializers.IntegerField()
    active_events = serializers.IntegerField()
    membership_sales = serializers.IntegerField()
    # A JSON number, not a string, so the page can add and format it.
    revenue = serializers.DecimalField(max_digits=14, decimal_places=2, coerce_to_string=False)
    storage_usage_mb = serializers.FloatField()
    channel_usage = AdminChannelUsageSerializer(many=True)


# --------------------------------------------------
# User Management
# --------------------------------------------------

class AdminUserListSerializer(serializers.ModelSerializer):
    """Read serializer for the admin's user list/detail views."""

    class Meta:
        model = User
        fields = (
            "id",
            "full_name",
            "email",
            "mobile_number",
            "role",
            "is_verified",
            "is_active",
            "is_suspended",
            "created_at",
        )
        read_only_fields = fields


class AdminUserUpdateSerializer(serializers.ModelSerializer):
    """An admin editing a user's core profile fields.

    Passwords are never handled here. Suspending has its own endpoint so it
    stays a single deliberate action. The admin's own account (and the last
    active admin) is protected by services.check_user_update.
    """

    class Meta:
        model = User
        fields = (
            "full_name",
            "email",
            "mobile_number",
            "role",
            "is_verified",
            "is_active",
        )

    def validate_full_name(self, value: str) -> str:
        value = value.strip()

        if not value:
            raise serializers.ValidationError("Name is required.")

        return value

    def validate_email(self, value: str) -> str:
        value = value.strip().lower()

        queryset = User.objects.filter(email__iexact=value)

        if self.instance is not None:
            queryset = queryset.exclude(pk=self.instance.pk)

        if queryset.exists():
            raise serializers.ValidationError("A user with this email already exists.")

        return value

    def validate_mobile_number(self, value: str) -> str:
        try:
            mobile = normalize_admin_mobile(value)
        except ValueError as error:
            raise serializers.ValidationError(str(error))

        # Matches however the other account's number was typed or stored.
        existing = get_user_by_mobile(mobile)

        if existing is not None and (self.instance is None or existing.pk != self.instance.pk):
            raise serializers.ValidationError("A user with this mobile number already exists.")

        return mobile


# --------------------------------------------------
# Membership Management
# --------------------------------------------------

class AdminMembershipPlanSerializer(serializers.ModelSerializer):
    """Full read/write serializer for admin plan CRUD.

    guest_limit, event_limit and storage_limit_mb are required numbers: the
    database column cannot hold "unlimited" for them. total_invitations,
    template_limit and voice_call_limit can be empty (= unlimited).
    """

    class Meta:
        model = MembershipPlan
        fields = (
            "id",
            "name",
            "slug",
            "description",
            "price",
            "duration_days",
            "guest_limit",
            "event_limit",
            "total_invitations",
            "template_limit",
            "voice_call_limit",
            "storage_limit_mb",
            "gallery_enabled",
            "qr_code_enabled",
            "photographer_access_enabled",
            "is_active",
            "display_order",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "created_at", "updated_at")

    def validate_name(self, value: str) -> str:
        value = value.strip()

        if not value:
            raise serializers.ValidationError("Name is required.")

        return value

    def validate_slug(self, value: str) -> str:
        value = value.strip().lower()

        queryset = MembershipPlan.objects.filter(slug=value)

        if self.instance is not None:
            queryset = queryset.exclude(pk=self.instance.pk)

        if queryset.exists():
            raise serializers.ValidationError("A plan with this slug already exists.")

        return value

    def validate_price(self, value):
        if value < 0:
            raise serializers.ValidationError("Price cannot be negative.")

        return value

    def validate_duration_days(self, value: int) -> int:
        if value < 1:
            raise serializers.ValidationError("A plan must last at least 1 day.")

        return value


# --------------------------------------------------
# Invitation Templates
# --------------------------------------------------

class AdminInvitationTemplateSerializer(serializers.ModelSerializer):
    """Full read/write serializer for admin template CRUD."""

    class Meta:
        model = InvitationTemplate
        fields = (
            "id",
            "name",
            "description",
            "preview_image",
            "background_image",
            "is_active",
            "display_order",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "created_at", "updated_at")

    @staticmethod
    def _check_image_size(value):
        if value is not None and getattr(value, "size", 0) > MAX_TEMPLATE_IMAGE_BYTES:
            raise serializers.ValidationError("Image is too large. The limit is 10 MB.")

        return value

    def validate_preview_image(self, value):
        if value is not None:
            validate_image_content(value)

        return self._check_image_size(value)

    def validate_background_image(self, value):
        if value is not None:
            validate_image_content(value)

        return self._check_image_size(value)

    def validate(self, attrs: dict) -> dict:
        """A new library template needs its card design, otherwise organizers
        would pick a blank template that cannot render an invitation."""

        if self.instance is None and not attrs.get("background_image"):
            raise serializers.ValidationError(
                {"background_image": "Upload the template's background image."}
            )

        return attrs


# --------------------------------------------------
# Media Management
# --------------------------------------------------

class AdminGalleryMediaSerializer(serializers.ModelSerializer):
    """Read serializer for the admin's media management list."""

    event_name = serializers.CharField(source="event.name", read_only=True)
    uploaded_by_name = serializers.CharField(source="uploaded_by.full_name", read_only=True, default=None)

    class Meta:
        model = GalleryMedia
        fields = (
            "id",
            "event",
            "event_name",
            "media_type",
            "file",
            "thumbnail",
            "caption",
            "is_featured",
            "uploaded_by_name",
            "file_size",
            "created_at",
        )
        read_only_fields = fields


# --------------------------------------------------
# Reports
# --------------------------------------------------

class RevenueReportPointSerializer(serializers.Serializer):
    period = serializers.CharField()
    amount = serializers.DecimalField(max_digits=14, decimal_places=2, coerce_to_string=False)


class RegistrationsReportPointSerializer(serializers.Serializer):
    period = serializers.CharField()
    count = serializers.IntegerField()


class MembershipStatsSerializer(serializers.Serializer):
    plan_name = serializers.CharField()
    active_subscribers = serializers.IntegerField()


class AdminReportsSerializer(serializers.Serializer):
    """Revenue, Registrations, Active Events, Membership Statistics, Storage."""

    revenue_by_period = RevenueReportPointSerializer(many=True)
    registrations_by_period = RegistrationsReportPointSerializer(many=True)
    active_events_count = serializers.IntegerField()
    membership_statistics = MembershipStatsSerializer(many=True)
    storage_usage_mb = serializers.FloatField()


# --------------------------------------------------
# Platform channel pools + topup packs
# --------------------------------------------------

class PlatformChannelPoolSerializer(serializers.ModelSerializer):
    """A platform channel pool for the admin.

    `is_configured` is False for a channel that has never been topped up
    (no database row yet). Such a channel is UNLIMITED as far as sending is
    concerned, so it is never reported as low or exhausted.
    """

    channel_display = serializers.CharField(source="get_channel_display", read_only=True)
    remaining = serializers.SerializerMethodField()
    is_configured = serializers.SerializerMethodField()
    is_low = serializers.SerializerMethodField()
    is_exhausted = serializers.SerializerMethodField()

    class Meta:
        model = PlatformChannelPool
        fields = (
            "id",
            "channel",
            "channel_display",
            "total_capacity",
            "used",
            "remaining",
            "low_balance_threshold",
            "is_configured",
            "is_low",
            "is_exhausted",
            "updated_at",
        )
        read_only_fields = fields

    def get_remaining(self, obj: PlatformChannelPool) -> int:
        return obj.remaining()

    def get_is_configured(self, obj: PlatformChannelPool) -> bool:
        return obj.pk is not None

    def get_is_low(self, obj: PlatformChannelPool) -> bool:
        return obj.pk is not None and obj.is_low()

    def get_is_exhausted(self, obj: PlatformChannelPool) -> bool:
        return obj.pk is not None and obj.is_exhausted()


class PlatformPoolTopupCreateSerializer(serializers.Serializer):
    """An admin request to top up a pool (and optionally change the
    low-balance warning level)."""

    channel = serializers.ChoiceField(choices=PlatformChannelPool.Channel.choices)
    amount = serializers.IntegerField(min_value=1, max_value=MAX_POOL_TOPUP)
    note = serializers.CharField(required=False, allow_blank=True, default="", max_length=255)
    low_balance_threshold = serializers.IntegerField(required=False, min_value=0, max_value=MAX_POOL_TOPUP)


class PlatformPoolTopupSerializer(serializers.ModelSerializer):
    """A pool's topup history (audit trail)."""

    channel = serializers.CharField(source="pool.channel", read_only=True)
    channel_display = serializers.CharField(source="pool.get_channel_display", read_only=True)
    topped_up_by_name = serializers.CharField(source="topped_up_by.full_name", read_only=True, default=None)

    class Meta:
        model = PlatformPoolTopup
        fields = (
            "id",
            "channel",
            "channel_display",
            "amount",
            "note",
            "topped_up_by_name",
            "created_at",
        )
        read_only_fields = fields


class AdminTopupPackSerializer(serializers.ModelSerializer):
    """Admin CRUD on topup packs (the fixed packs organizers can buy)."""

    class Meta:
        model = TopupPack
        fields = (
            "id",
            "name",
            "kind",
            "quantity",
            "price",
            "is_active",
            "display_order",
        )
        read_only_fields = ("id",)

    def validate_name(self, value: str) -> str:
        value = value.strip()

        if not value:
            raise serializers.ValidationError("Name is required.")

        return value

    def validate_quantity(self, value: int) -> int:
        if value < 1:
            raise serializers.ValidationError("Quantity must be at least 1.")

        return value

    def validate_price(self, value):
        if value <= 0:
            raise serializers.ValidationError("Price must be more than 0.")

        return value