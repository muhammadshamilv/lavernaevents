from django.conf import settings
from django.contrib import admin
from django.contrib.auth.admin import UserAdmin

from .models import MobileOTP, User


@admin.register(User)
class CustomUserAdmin(UserAdmin):
    """Admin configuration for the custom User model."""

    model = User

    list_display = (
        "mobile_number",
        "full_name",
        "email",
        "role",
        "is_verified",
        "is_active",
        "is_suspended",
        "created_at",
    )

    list_filter = (
        "role",
        "is_verified",
        "is_active",
        "is_suspended",
        "is_staff",
    )

    search_fields = (
        "mobile_number",
        "email",
        "full_name",
    )

    ordering = ("-created_at",)

    readonly_fields = (
        "created_at",
        "updated_at",
        "last_login",
    )

    fieldsets = (
        (
            "Account Information",
            {"fields": ("mobile_number", "email", "password")},
        ),
        (
            "Personal Information",
            {"fields": ("full_name", "profile_image")},
        ),
        (
            "Role & Status",
            {
                "fields": (
                    "role",
                    "is_verified",
                    "is_active",
                    "is_suspended",
                    "is_staff",
                    "is_superuser",
                )
            },
        ),
        (
            "Permissions",
            {"fields": ("groups", "user_permissions")},
        ),
        (
            "Important Dates",
            {"fields": ("last_login", "created_at", "updated_at")},
        ),
    )

    add_fieldsets = (
        (
            "Create User",
            {
                "classes": ("wide",),
                "fields": (
                    "mobile_number",
                    "email",
                    "full_name",
                    "password1",
                    "password2",
                    "role",
                    "is_verified",
                    "is_active",
                ),
            },
        ),
    )


@admin.register(MobileOTP)
class MobileOTPAdmin(admin.ModelAdmin):
    """Read-only view of OTPs for support / debugging.

    The code itself is shown only while DEBUG is on, so staff on the live
    site cannot read other people's verification or reset codes.
    """

    list_display = (
        "user",
        "purpose",
        "shown_code",
        "attempts",
        "is_used",
        "expires_at",
        "created_at",
    )

    list_filter = ("purpose", "is_used")

    search_fields = (
        "user__mobile_number",
        "user__email",
    )

    ordering = ("-created_at",)

    readonly_fields = (
        "user",
        "purpose",
        "shown_code",
        "attempts",
        "is_used",
        "expires_at",
        "created_at",
    )

    exclude = ("code",)

    @admin.display(description="Code")
    def shown_code(self, obj):
        return obj.code if settings.DEBUG else "******"

    def has_add_permission(self, request):
        return False
