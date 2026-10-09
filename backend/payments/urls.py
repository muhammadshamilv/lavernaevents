from django.urls import path

from .views import (
    CreateCheckoutSessionView,
    CreateTopupCheckoutSessionView,
    PaymentHistoryView,
    PaymentStatusView,
    StripeWebhookView,
    TopupPurchaseStatusView,
)


urlpatterns = [
    path("create-checkout-session/", CreateCheckoutSessionView.as_view(), name="create-checkout-session"),
    path("status/<str:session_id>/", PaymentStatusView.as_view(), name="payment-status"),
    path("webhook/", StripeWebhookView.as_view(), name="stripe-webhook"),
    path("history/", PaymentHistoryView.as_view(), name="payment-history"),

    # Organizer topup pack purchases
    path("topup/create-checkout-session/", CreateTopupCheckoutSessionView.as_view(), name="create-topup-checkout-session"),
    path("topup/status/<str:session_id>/", TopupPurchaseStatusView.as_view(), name="topup-purchase-status"),
]