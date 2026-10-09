# backend/payments/views.py
import logging

import stripe
from django.conf import settings
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

try:  # stripe-python >= 8
    from stripe import SignatureVerificationError
except ImportError:  # pragma: no cover - older stripe-python
    from stripe.error import SignatureVerificationError

from .serializers import (
    CreateCheckoutSessionSerializer,
    CreateTopupCheckoutSessionSerializer,
    PaymentHistoryItemSerializer,
    PaymentSerializer,
    TopupPurchaseSerializer,
)
from .services import (
    PaymentError,
    create_checkout_session,
    create_topup_checkout_session,
    get_payment_history,
    get_payment_status,
    get_topup_purchase_status,
    handle_checkout_completed,
    handle_checkout_failed,
    handle_topup_checkout_completed,
)

logger = logging.getLogger(__name__)

PAYMENT_ERROR_STATUS_MAP = {
    "plan_not_found": status.HTTP_404_NOT_FOUND,
    "payment_not_found": status.HTTP_404_NOT_FOUND,
    "pack_not_found": status.HTTP_404_NOT_FOUND,
    "topup_purchase_not_found": status.HTTP_404_NOT_FOUND,
    "already_subscribed": status.HTTP_409_CONFLICT,
    "no_active_subscription": status.HTTP_409_CONFLICT,
    "topup_not_needed": status.HTTP_409_CONFLICT,
    "voice_not_available": status.HTTP_409_CONFLICT,
    "organizer_only": status.HTTP_403_FORBIDDEN,
    "mobile_not_verified": status.HTTP_403_FORBIDDEN,
    "payments_not_configured": status.HTTP_503_SERVICE_UNAVAILABLE,
    "stripe_error": status.HTTP_502_BAD_GATEWAY,
}


def _payment_error_response(error: PaymentError, field: str) -> Response:
    return Response(
        {
            "success": False,
            "message": error.message,
            "errors": {field: [error.message]},
        },
        status=PAYMENT_ERROR_STATUS_MAP.get(error.code, status.HTTP_400_BAD_REQUEST),
    )


def _frontend_url() -> str:
    return settings.FRONTEND_URL.rstrip("/")


class CreateCheckoutSessionView(APIView):
    """Create a Stripe Checkout Session for purchasing a PAID membership plan."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = CreateCheckoutSessionSerializer(data=request.data)

        if not serializer.is_valid():
            return Response(
                {"success": False, "message": "Invalid request.", "errors": serializer.errors},
                status=status.HTTP_400_BAD_REQUEST,
            )

        frontend_url = _frontend_url()

        try:
            payment, checkout_url = create_checkout_session(
                user=request.user,
                plan_slug=serializer.validated_data["plan_slug"],
                success_url=f"{frontend_url}/payment/success?session_id={{CHECKOUT_SESSION_ID}}",
                cancel_url=f"{frontend_url}/payment/cancelled",
            )
        except PaymentError as error:
            return _payment_error_response(error, "plan_slug")

        return Response(
            {
                "success": True,
                "message": "Checkout session created successfully.",
                "data": {
                    "checkout_url": checkout_url,
                    "stripe_checkout_session_id": payment.stripe_checkout_session_id,
                },
            },
            status=status.HTTP_201_CREATED,
        )


class PaymentStatusView(APIView):
    """Status of a plan payment after returning from Stripe Checkout."""

    permission_classes = [IsAuthenticated]

    def get(self, request, session_id):
        try:
            payment = get_payment_status(session_id, request.user)
        except PaymentError as error:
            return _payment_error_response(error, "session")

        return Response(
            {
                "success": True,
                "message": "Payment status retrieved successfully.",
                "data": PaymentSerializer(payment).data,
            },
            status=status.HTTP_200_OK,
        )


class StripeWebhookView(APIView):
    """Receive and verify Stripe webhook events.

    The TRUSTED confirmation path for payment success: the browser redirect
    after checkout only shows a "processing" screen. Events handled:

      checkout.session.completed / async_payment_succeeded -> activate
      checkout.session.expired   / async_payment_failed    -> mark FAILED

    Replies 200 for events it understood (even when it logs a problem, so
    Stripe does not retry forever) and 500 for unexpected crashes (so Stripe
    DOES retry).
    """

    permission_classes = [AllowAny]
    authentication_classes: list = []

    def post(self, request):
        webhook_secret = getattr(settings, "STRIPE_WEBHOOK_SECRET", "")

        if not webhook_secret:
            logger.error("STRIPE_WEBHOOK_SECRET is not configured.")

            return Response(
                {"success": False, "message": "Webhook is not configured."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        try:
            event = stripe.Webhook.construct_event(
                request.body,
                request.META.get("HTTP_STRIPE_SIGNATURE", ""),
                webhook_secret,
            )
        except (ValueError, SignatureVerificationError) as error:
            logger.warning("Stripe webhook signature verification failed: %s", error)

            return Response(
                {"success": False, "message": "Invalid webhook signature."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        event_type = event["type"]
        logger.info("Stripe webhook received: %s", event_type)

        if event_type in (
            "checkout.session.completed",
            "checkout.session.async_payment_succeeded",
        ):
            session_data = event["data"]["object"]
            session_dict = (
                session_data.to_dict() if hasattr(session_data, "to_dict") else session_data
            )
            is_topup = "topup_pack_id" in (session_dict.get("metadata") or {})

            try:
                if is_topup:
                    handle_topup_checkout_completed(session_data)
                else:
                    handle_checkout_completed(session_data)
            except PaymentError as error:
                logger.error(
                    "Failed to process %s (topup=%s, code=%s): %s",
                    event_type,
                    is_topup,
                    error.code,
                    error.message,
                )

        elif event_type in (
            "checkout.session.expired",
            "checkout.session.async_payment_failed",
        ):
            handle_checkout_failed(event["data"]["object"])

        return Response({"success": True}, status=status.HTTP_200_OK)


class CreateTopupCheckoutSessionView(APIView):
    """Create a Stripe Checkout Session for purchasing a TopupPack."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = CreateTopupCheckoutSessionSerializer(data=request.data)

        if not serializer.is_valid():
            return Response(
                {"success": False, "message": "Invalid request.", "errors": serializer.errors},
                status=status.HTTP_400_BAD_REQUEST,
            )

        frontend_url = _frontend_url()

        try:
            purchase, checkout_url = create_topup_checkout_session(
                user=request.user,
                pack_id=serializer.validated_data["pack_id"],
                success_url=f"{frontend_url}/payment/topup-success?session_id={{CHECKOUT_SESSION_ID}}",
                cancel_url=f"{frontend_url}/payment/cancelled?type=topup",
            )
        except PaymentError as error:
            return _payment_error_response(error, "pack_id")

        return Response(
            {
                "success": True,
                "message": "Topup checkout session created successfully.",
                "data": {
                    "checkout_url": checkout_url,
                    "stripe_checkout_session_id": purchase.stripe_checkout_session_id,
                },
            },
            status=status.HTTP_201_CREATED,
        )


class TopupPurchaseStatusView(APIView):
    """Status of a topup purchase after returning from Stripe Checkout."""

    permission_classes = [IsAuthenticated]

    def get(self, request, session_id):
        try:
            purchase = get_topup_purchase_status(session_id, request.user)
        except PaymentError as error:
            return _payment_error_response(error, "session")

        return Response(
            {
                "success": True,
                "message": "Topup purchase status retrieved successfully.",
                "data": TopupPurchaseSerializer(purchase).data,
            },
            status=status.HTTP_200_OK,
        )


class PaymentHistoryView(APIView):
    """The logged-in user's billing history (plan payments and topups)."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        items = get_payment_history(request.user)

        return Response(
            {
                "success": True,
                "message": "Billing history retrieved successfully.",
                "data": PaymentHistoryItemSerializer(items, many=True).data,
            },
            status=status.HTTP_200_OK,
        )
