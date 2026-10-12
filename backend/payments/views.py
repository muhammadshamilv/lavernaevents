# backend/payments/views.py
import json
import logging

from django.conf import settings
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

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
    handle_webhook_event,
    verify_webhook_signature,
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
    "gateway_error": status.HTTP_502_BAD_GATEWAY,
    "amount_mismatch": status.HTTP_409_CONFLICT,
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
    """Create a Cashfree order for purchasing a PAID membership plan."""

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
            payment, checkout = create_checkout_session(
                user=request.user,
                plan_slug=serializer.validated_data["plan_slug"],
                return_url=f"{frontend_url}/payment/success?session_id={{order_id}}",
            )
        except PaymentError as error:
            return _payment_error_response(error, "plan_slug")

        return Response(
            {
                "success": True,
                "message": "Checkout session created successfully.",
                "data": checkout,
            },
            status=status.HTTP_201_CREATED,
        )


class PaymentStatusView(APIView):
    """Status of a plan payment after returning from Cashfree checkout."""

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


class CashfreeWebhookView(APIView):
    """Receive and verify Cashfree webhooks.

    The TRUSTED confirmation path for payment success: the browser redirect
    after checkout only shows a "processing" screen. The signature is checked
    over the RAW request body, then the order is re-fetched from Cashfree
    before anything is activated.

    Answers 200 when the event was understood or can be ignored, 400 for a
    bad signature, and 5xx when Cashfree could not be reached so that
    Cashfree retries the delivery later.
    """

    permission_classes = [AllowAny]
    authentication_classes: list = []

    def post(self, request):
        if not getattr(settings, "CASHFREE_SECRET_KEY", ""):
            logger.error("CASHFREE_SECRET_KEY is not configured.")

            return Response(
                {"success": False, "message": "Webhook is not configured."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        raw_body = request.body

        if not verify_webhook_signature(
            raw_body,
            request.META.get("HTTP_X_WEBHOOK_TIMESTAMP", ""),
            request.META.get("HTTP_X_WEBHOOK_SIGNATURE", ""),
        ):
            logger.warning("Cashfree webhook signature verification failed.")

            return Response(
                {"success": False, "message": "Invalid webhook signature."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            payload = json.loads(raw_body.decode("utf-8"))
        except ValueError:
            payload = None

        if not isinstance(payload, dict):
            return Response(
                {"success": False, "message": "Invalid webhook body."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        logger.info("Cashfree webhook received: %s", payload.get("type"))

        try:
            handle_webhook_event(payload)
        except PaymentError as error:
            if error.code == "gateway_error":
                # Let Cashfree retry later.
                return Response(
                    {"success": False, "message": "Please retry."},
                    status=status.HTTP_503_SERVICE_UNAVAILABLE,
                )

            # A problem on our side that a retry cannot fix (e.g. amount
            # mismatch): logged, and not retried forever.
            logger.error("Cashfree webhook not applied (%s): %s", error.code, error.message)

        return Response({"success": True}, status=status.HTTP_200_OK)


class CreateTopupCheckoutSessionView(APIView):
    """Create a Cashfree order for purchasing a TopupPack."""

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
            purchase, checkout = create_topup_checkout_session(
                user=request.user,
                pack_id=serializer.validated_data["pack_id"],
                return_url=f"{frontend_url}/payment/topup-success?session_id={{order_id}}",
            )
        except PaymentError as error:
            return _payment_error_response(error, "pack_id")

        return Response(
            {
                "success": True,
                "message": "Topup checkout session created successfully.",
                "data": checkout,
            },
            status=status.HTTP_201_CREATED,
        )


class TopupPurchaseStatusView(APIView):
    """Status of a topup purchase after returning from Cashfree checkout."""

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
