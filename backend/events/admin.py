from django.contrib import admin

from .models import Event


@admin.register(Event)
class EventAdmin(admin.ModelAdmin):
    """Admin configuration for events."""

    list_display = (
        "name",
        "organizer",
        "event_type",
        "event_date",
        "status",
        "created_at",
    )

    list_select_related = ("organizer",)

    list_filter = (
        "event_type",
        "status",
    )

    search_fields = (
        "name",
        "organizer__mobile_number",
        "organizer__email",
        "venue_name",
    )

    ordering = (
        "-event_date",
    )

    readonly_fields = (
        "created_at",
        "updated_at",
    )

    fieldsets = (
        ("Organizer", {"fields": ("organizer",)}),
        (
            "Event Details",
            {
                "fields": (
                    "name",
                    "event_type",
                    "custom_event_type_label",
                    "host_name",
                    "description",
                    "status",
                )
            },
        ),
        (
            "Date & Venue",
            {
                "fields": (
                    "event_date",
                    "event_time",
                    "event_end_time",
                    "venue_name",
                    "address",
                    "google_maps_link",
                )
            },
        ),
        ("Media", {"fields": ("cover_image",)}),
        ("Timestamps", {"fields": ("created_at", "updated_at")}),
    )