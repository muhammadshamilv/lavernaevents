from django.contrib import admin

from .models import Guest, GuestCategory


@admin.register(Guest)
class GuestAdmin(admin.ModelAdmin):
    """Admin configuration for guests."""

    list_display = (
        "name",
        "mobile_number",
        "event",
        "category",
        "family_member_count",
        "invitation_status",
        "response_status",
        "responded_at",
        "created_at",
    )

    list_select_related = ("event", "category")

    list_filter = (
        "invitation_status",
        "response_status",
    )

    search_fields = (
        "name",
        "mobile_number",
        "email",
        "event__name",
    )

    ordering = ("-created_at",)

    raw_id_fields = ("event", "category")

    readonly_fields = (
        "responded_at",
        "created_at",
        "updated_at",
    )


if not admin.site.is_registered(GuestCategory):

    @admin.register(GuestCategory)
    class GuestCategoryAdmin(admin.ModelAdmin):
        list_display = ("name", "event", "display_order")
        list_select_related = ("event",)
        search_fields = ("name", "event__name")
        raw_id_fields = ("event",)
