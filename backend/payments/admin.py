from django.contrib import admin

from .models import Payment


class ReadOnlyFinanceAdmin(admin.ModelAdmin):
    """Money records are written only by the payment flow, never by hand."""

    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(Payment)
class PaymentAdmin(ReadOnlyFinanceAdmin):
    """Read-only view of plan payments."""

    list_display = (
        "user",
        "plan",
        "amount",
        "currency",
        "status",
        "stripe_checkout_session_id",
        "created_at",
    )

    list_filter = ("status", "plan")

    search_fields = (
        "user__mobile_number",
        "user__email",
        "stripe_checkout_session_id",
        "stripe_payment_intent_id",
    )

    ordering = ("-created_at",)

    readonly_fields = (
        "user",
        "plan",
        "amount",
        "currency",
        "status",
        "stripe_checkout_session_id",
        "stripe_payment_intent_id",
        "created_at",
        "updated_at",
    )