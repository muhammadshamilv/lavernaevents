from rest_framework import serializers

from .models import MembershipPlan, Subscription
from .topup_models import TopupPack


class MembershipPlanSerializer(serializers.ModelSerializer):
    """Serializer for listing and viewing membership plans (public, read-only)."""

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
            "display_order",
        )
        read_only_fields = fields


class SubscriptionSerializer(serializers.ModelSerializer):
    """Serializer for reading a user's subscription, with nested plan details."""

    plan = MembershipPlanSerializer(read_only=True)
    invitations_remaining = serializers.SerializerMethodField()
    voice_calls_remaining = serializers.SerializerMethodField()

    class Meta:
        model = Subscription
        fields = (
            "id",
            "plan",
            "status",
            "invitations_used",
            "invitations_topup",
            "invitations_remaining",
            "voice_calls_used",
            "voice_calls_topup",
            "voice_calls_remaining",
            "started_at",
            "expires_at",
            "cancelled_at",
        )
        read_only_fields = fields

    def get_invitations_remaining(self, obj: Subscription):
        return obj.invitations_remaining()

    def get_voice_calls_remaining(self, obj: Subscription):
        return obj.voice_calls_remaining()


class ExpiredSubscriptionSerializer(serializers.Serializer):
    """The plan that most recently ran out, shown as "expired on <date>"."""

    plan_name = serializers.CharField(source="plan.name")
    plan_slug = serializers.CharField(source="plan.slug")
    expired_at = serializers.DateTimeField(source="expires_at")


class SubscribeSerializer(serializers.Serializer):
    """Serializer for validating a subscribe request."""

    plan_slug = serializers.SlugField(required=True)


class ChangePlanSerializer(serializers.Serializer):
    """Serializer for validating an upgrade/downgrade request."""

    plan_slug = serializers.SlugField(required=True)


class MyUsageSerializer(serializers.Serializer):
    """Serializer for reporting the user's current plan and usage limits.

    Phase 17: added template_count/template_remaining (the organizer's
    actual OrganizerTemplateLibrary usage against template_limit),
    alongside the existing invitation/voice-call quota fields.

    Phase 26: added invitations_topup/voice_calls_topup, the extra
    allowance purchased on top of the plan's own limits - shown
    separately from the base plan limit so the organizer can see exactly
    how much of their remaining quota came from a topup purchase versus
    their plan.
    """

    plan_name = serializers.CharField()
    has_active_plan = serializers.BooleanField()

    guest_limit = serializers.IntegerField(allow_null=True)
    event_limit = serializers.IntegerField(allow_null=True)

    template_limit = serializers.IntegerField(allow_null=True)
    template_count = serializers.IntegerField(allow_null=True)
    template_remaining = serializers.IntegerField(allow_null=True)

    storage_limit_mb = serializers.IntegerField(allow_null=True)

    total_invitations = serializers.IntegerField(allow_null=True)
    invitations_used = serializers.IntegerField(allow_null=True)
    invitations_topup = serializers.IntegerField(allow_null=True)
    invitations_remaining = serializers.IntegerField(allow_null=True)

    voice_call_limit = serializers.IntegerField(allow_null=True)
    voice_calls_used = serializers.IntegerField(allow_null=True)
    voice_calls_topup = serializers.IntegerField(allow_null=True)
    voice_calls_remaining = serializers.IntegerField(allow_null=True)

    gallery_enabled = serializers.BooleanField()
    qr_code_enabled = serializers.BooleanField()
    photographer_access_enabled = serializers.BooleanField()


# ---------------------------------------------------------------------
# Phase 26: organizer topup packs
# ---------------------------------------------------------------------

class TopupPackSerializer(serializers.ModelSerializer):
    """Serializer for listing available topup packs to organizers
    (public within the authenticated app, read-only - admin CRUD for
    packs lives in admin_panel instead)."""

    class Meta:
        model = TopupPack
        fields = (
            "id",
            "name",
            "kind",
            "quantity",
            "price",
            "display_order",
        )
        read_only_fields = fields