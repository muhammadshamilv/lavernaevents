from django.contrib import admin

from .models import MembershipPlan, OrganizerTemplateLibrary, Subscription
from .topup_models import PlatformChannelPool, PlatformPoolTopup, TopupPack, TopupPurchase


@admin.register(MembershipPlan)
class MembershipPlanAdmin(admin.ModelAdmin):
    """Admin configuration for membership plans."""

    list_display = (
        "name",
        "price",
        "duration_days",
        "guest_limit",
        "event_limit",
        "total_invitations",
        "template_limit",
        "voice_call_limit",
        "storage_limit_mb",
        "is_active",
        "display_order",
    )

    list_filter = (
        "is_active",
        "gallery_enabled",
        "qr_code_enabled",
        "photographer_access_enabled",
    )

    search_fields = (
        "name",
        "slug",
    )

    prepopulated_fields = {
        "slug": ("name",),
    }

    ordering = (
        "display_order",
        "price",
    )

    readonly_fields = (
        "created_at",
        "updated_at",
    )

    fieldsets = (
        (
            "Plan Information",
            {
                "fields": (
                    "name",
                    "slug",
                    "description",
                    "price",
                    "duration_days",
                    "is_active",
                    "display_order",
                )
            },
        ),
        (
            "Limits",
            {
                "fields": (
                    "guest_limit",
                    "event_limit",
                    "storage_limit_mb",
                )
            },
        ),
        (
            "Invitation Quotas",
            {
                "fields": (
                    "total_invitations",
                    "template_limit",
                    "voice_call_limit",
                ),
                "description": (
                    "total_invitations is a single pool shared across WhatsApp, "
                    "Email, and SMS sends. template_limit caps how many distinct "
                    "templates (platform + the organizer's own custom uploads) the "
                    "organizer may add to their library - see the Organizer Template "
                    "Library section below for what's actually been added by whom. "
                    "voice_call_limit is separate since automated voice calls cost "
                    "far more per unit than a text-based send. Leave a field blank "
                    "for unlimited."
                ),
            },
        ),
        (
            "Feature Access",
            {
                "fields": (
                    "gallery_enabled",
                    "qr_code_enabled",
                    "photographer_access_enabled",
                )
            },
        ),
        (
            "Timestamps",
            {
                "fields": (
                    "created_at",
                    "updated_at",
                )
            },
        ),
    )


@admin.register(Subscription)
class SubscriptionAdmin(admin.ModelAdmin):
    """Admin configuration for user subscriptions."""

    list_display = (
        "user",
        "plan",
        "status",
        "invitations_used",
        "voice_calls_used",
        "started_at",
        "expires_at",
    )

    list_filter = (
        "status",
        "plan",
    )

    search_fields = (
        "user__mobile_number",
        "user__email",
        "user__full_name",
    )

    ordering = (
        "-created_at",
    )

    readonly_fields = (
        "started_at",
        "created_at",
        "updated_at",
    )


@admin.register(OrganizerTemplateLibrary)
class OrganizerTemplateLibraryAdmin(admin.ModelAdmin):
    """Admin configuration for viewing/managing organizers' template libraries.

    Phase 17. Lets platform admins see at a glance how many templates each
    organizer has added, and manually remove one (e.g. to free up a slot
    as a support action) without touching the InvitationTemplate itself.
    """

    list_display = (
        "organizer",
        "template",
        "added_at",
    )

    list_filter = (
        "template__channel",
        "template__is_custom",
    )

    search_fields = (
        "organizer__mobile_number",
        "organizer__email",
        "organizer__full_name",
        "template__name",
    )

    ordering = (
        "-added_at",
    )

    readonly_fields = (
        "added_at",
    )


@admin.register(TopupPack)
class TopupPackAdmin(admin.ModelAdmin):
    """The fixed packs organizers can buy (also managed from the admin portal)."""

    list_display = ("name", "kind", "quantity", "price", "is_active", "display_order")
    list_filter = ("kind", "is_active")
    search_fields = ("name",)
    ordering = ("display_order", "price")


@admin.register(TopupPurchase)
class TopupPurchaseAdmin(admin.ModelAdmin):
    """Payment records: view only, so they can never be edited by hand."""

    list_display = ("user", "pack", "amount", "status", "created_at")
    list_filter = ("status", "pack__kind")
    search_fields = ("user__mobile_number", "user__email", "stripe_checkout_session_id")
    ordering = ("-created_at",)

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(PlatformChannelPool)
class PlatformChannelPoolAdmin(admin.ModelAdmin):
    """Platform-wide send capacity per channel. Capacity changes through the
    admin portal's Top up action, which keeps an audit trail."""

    list_display = ("channel", "total_capacity", "used", "low_balance_threshold", "updated_at")
    readonly_fields = ("channel", "total_capacity", "used", "created_at", "updated_at")

    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(PlatformPoolTopup)
class PlatformPoolTopupAdmin(admin.ModelAdmin):
    """Audit trail of pool top-ups: view only."""

    list_display = ("pool", "amount", "note", "topped_up_by", "created_at")
    list_filter = ("pool__channel",)
    ordering = ("-created_at",)

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
