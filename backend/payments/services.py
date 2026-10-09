# backend/payments/services.py
import logging
from decimal import Decimal

import stripe
from django.conf import settings
from django.db import models as dj_models
from django.db import transaction
from django.utils import timezone

try:  # stripe-python >= 8
    from stripe import StripeError
except ImportError:  # pragma: no cover - older stripe-python
    from stripe.error import StripeError

from memberships.models import MembershipPlan, Subscription
from memberships.services import (
    SubscriptionError,
    activate_plan_for_user,
    check_can_purchase,
    get_active_subscription,
)
from memberships.topup_models import TopupPack, TopupPurchase

from .models import Payment

logger = logging.getLogger(__name__)

CURRENCY = "inr"


class PaymentError(Exception):
    """Raised when a payment action cannot be completed."""

    def __init__(self, message: str, code: str = "payment_error"):
        self.message = message
        self.code = code
        super().__init__(message)


# --------------------------------------------------
# Helpers
# --------------------------------------------------

def _configure_stripe() -> None:
    key = getattr(settings, "STRIPE_SECRET_KEY", "")

    if not key:
        raise PaymentError(
            "Online payments are not configured yet. Please contact support.",
            code="payments_not_configured",
        )

    stripe.api_key = key


def _amount_in_paise(price) -> int:
    return int((Decimal(price) * 100).quantize(Decimal("1")))


def _to_dict(obj) -> dict:
    return obj.to_dict() if hasattr(obj, "to_dict") else obj


def _check_purchaser(user) -> None:
    try:
        check_can_purchase(user)
    except SubscriptionError as error:
        raise PaymentError(error.message, code=error.code) from error


def _amount_matches(session_dict: dict, expected_price) -> bool:
    total = session_dict.get("amount_total")

    return total is None or int(total) == _amount_in_paise(expected_price)


# --------------------------------------------------
# Plan purchases
# --------------------------------------------------

def create_checkout_session(user, plan_slug: str, success_url: str, cancel_url: str):
    """Create a Stripe Checkout Session for a PAID membership plan.

    Returns (payment, checkout_url).
    """

    _check_purchaser(user)

    plan = MembershipPlan.objects.filter(slug=plan_slug, is_active=True).first()

    if plan is None:
        raise PaymentError(
            "No active membership plan found with this slug.",
            code="plan_not_found",
        )

    if plan.price <= 0:
        raise PaymentError(
            "This plan is free - select it directly instead of paying.",
            code="free_plan",
        )

    current = get_active_subscription(user)

    if current is not None and current.plan_id == plan.pk:
        raise PaymentError(
            "You are already on this plan. You can buy it again after it expires "
            f"({current.expires_at:%d %b %Y}).",
            code="already_subscribed",
        )

    _configure_stripe()

    try:
        session = stripe.checkout.Session.create(
            mode="payment",
            payment_method_types=["card"],
            line_items=[
                {
                    "price_data": {
                        "currency": CURRENCY,
                        "product_data": {"name": f"LavernaEvents - {plan.name} Plan"},
                        "unit_amount": _amount_in_paise(plan.price),
                    },
                    "quantity": 1,
                }
            ],
            success_url=success_url,
            cancel_url=cancel_url,
            client_reference_id=str(user.pk),
            metadata={"user_id": user.pk, "plan_slug": plan.slug},
        )
    except StripeError as error:
        logger.error("Stripe checkout creation failed: %s", error)

        raise PaymentError(
            "We couldn't start the payment. Please try again in a moment.",
            code="stripe_error",
        ) from error

    payment = Payment.objects.create(
        user=user,
        plan=plan,
        stripe_checkout_session_id=session.id,
        amount=plan.price,
        currency=CURRENCY.upper(),
        status=Payment.Status.CREATED,
    )

    return payment, session.url


def handle_checkout_completed(session_data) -> Payment:
    """Process a paid Stripe Checkout Session for a PLAN purchase.

    Safe to call more than once for the same session (webhook retries, the
    status-poll fallback): only the first call activates the plan.
    """

    session_dict = _to_dict(session_data)
    session_id = session_dict.get("id")

    with transaction.atomic():
        payment = (
            Payment.objects.select_for_update(of=("self",))
            .select_related("plan", "user")
            .filter(stripe_checkout_session_id=session_id)
            .first()
        )

        if payment is None:
            raise PaymentError(
                "Payment record not found for this checkout session.",
                code="payment_not_found",
            )

        if payment.status == Payment.Status.PAID:
            return payment

        if session_dict.get("payment_status") != "paid":
            # Completed but not (yet) paid, e.g. a delayed payment method.
            return payment

        if not _amount_matches(session_dict, payment.amount):
            logger.error(
                "Stripe amount mismatch for session %s: expected %s, got %s",
                session_id,
                payment.amount,
                session_dict.get("amount_total"),
            )
            raise PaymentError(
                "The paid amount does not match the plan price.",
                code="amount_mismatch",
            )

        payment.status = Payment.Status.PAID
        payment.stripe_payment_intent_id = session_dict.get("payment_intent", "") or ""
        payment.save(update_fields=["status", "stripe_payment_intent_id", "updated_at"])

        activate_plan_for_user(payment.user, payment.plan)

    return payment


def get_payment_status(checkout_session_id: str, user) -> Payment:
    """The payment for a checkout session, scoped to the requesting user.

    If it is still CREATED the status is checked with Stripe directly, so
    the page works even when the webhook is slow or not set up (local dev).
    """

    payment = Payment.objects.select_related("plan").filter(
        stripe_checkout_session_id=checkout_session_id,
        user=user,
    ).first()

    if payment is None:
        raise PaymentError("Payment record not found.", code="payment_not_found")

    if payment.status == Payment.Status.CREATED:
        _reconcile_with_stripe(
            checkout_session_id,
            lambda session: handle_checkout_completed(session),
        )
        payment.refresh_from_db()

    return payment


# --------------------------------------------------
# Topup pack purchases
# --------------------------------------------------

def create_topup_checkout_session(user, pack_id: int, success_url: str, cancel_url: str):
    """Create a Stripe Checkout Session for a TopupPack. Returns (purchase, url)."""

    _check_purchaser(user)

    pack = TopupPack.objects.filter(pk=pack_id, is_active=True).first()

    if pack is None:
        raise PaymentError(
            "No active topup pack found with this ID.",
            code="pack_not_found",
        )

    subscription = get_active_subscription(user)

    if subscription is None:
        raise PaymentError(
            "A topup extends an active plan. Choose a plan first.",
            code="no_active_subscription",
        )

    plan = subscription.plan

    if pack.kind == TopupPack.Kind.INVITATIONS and plan.total_invitations is None:
        raise PaymentError(
            "Your plan already includes unlimited invitations.",
            code="topup_not_needed",
        )

    if pack.kind == TopupPack.Kind.VOICE_CALLS:
        if plan.voice_call_limit is None:
            raise PaymentError(
                "Your plan already includes unlimited voice calls.",
                code="topup_not_needed",
            )

        if plan.voice_call_limit == 0:
            raise PaymentError(
                "Voice calls are not part of your plan. Upgrade your plan first.",
                code="voice_not_available",
            )

    _configure_stripe()

    try:
        session = stripe.checkout.Session.create(
            mode="payment",
            payment_method_types=["card"],
            line_items=[
                {
                    "price_data": {
                        "currency": CURRENCY,
                        "product_data": {"name": f"LavernaEvents Topup - {pack.name}"},
                        "unit_amount": _amount_in_paise(pack.price),
                    },
                    "quantity": 1,
                }
            ],
            success_url=success_url,
            cancel_url=cancel_url,
            client_reference_id=str(user.pk),
            metadata={"user_id": user.pk, "topup_pack_id": pack.pk},
        )
    except StripeError as error:
        logger.error("Stripe topup checkout creation failed: %s", error)

        raise PaymentError(
            "We couldn't start the payment. Please try again in a moment.",
            code="stripe_error",
        ) from error

    purchase = TopupPurchase.objects.create(
        user=user,
        pack=pack,
        stripe_checkout_session_id=session.id,
        amount=pack.price,
        status=TopupPurchase.Status.CREATED,
    )

    return purchase, session.url


def handle_topup_checkout_completed(session_data) -> TopupPurchase:
    """Process a paid Stripe Checkout Session for a TOPUP purchase (idempotent)."""

    session_dict = _to_dict(session_data)
    session_id = session_dict.get("id")

    with transaction.atomic():
        purchase = (
            TopupPurchase.objects.select_for_update(of=("self",))
            .select_related("pack", "user")
            .filter(stripe_checkout_session_id=session_id)
            .first()
        )

        if purchase is None:
            raise PaymentError(
                "Topup purchase record not found for this checkout session.",
                code="topup_purchase_not_found",
            )

        if purchase.status == TopupPurchase.Status.PAID:
            return purchase

        if session_dict.get("payment_status") != "paid":
            return purchase

        if not _amount_matches(session_dict, purchase.amount):
            logger.error(
                "Stripe amount mismatch for topup session %s: expected %s, got %s",
                session_id,
                purchase.amount,
                session_dict.get("amount_total"),
            )
            raise PaymentError(
                "The paid amount does not match the pack price.",
                code="amount_mismatch",
            )

        purchase.status = TopupPurchase.Status.PAID
        purchase.stripe_payment_intent_id = session_dict.get("payment_intent", "") or ""
        purchase.save(update_fields=["status", "stripe_payment_intent_id", "updated_at"])

        subscription = get_active_subscription(purchase.user)
        pack = purchase.pack

        if subscription is None:
            # Rare: the plan ended between paying and confirmation. The money
            # was received, so the purchase stays PAID; support must credit it.
            logger.error(
                "Topup %s paid but user %s has no active subscription to credit.",
                purchase.pk,
                purchase.user_id,
            )
        elif pack.kind == TopupPack.Kind.INVITATIONS:
            Subscription.objects.filter(pk=subscription.pk).update(
                invitations_topup=dj_models.F("invitations_topup") + pack.quantity,
                updated_at=timezone.now(),
            )
        elif pack.kind == TopupPack.Kind.VOICE_CALLS:
            Subscription.objects.filter(pk=subscription.pk).update(
                voice_calls_topup=dj_models.F("voice_calls_topup") + pack.quantity,
                updated_at=timezone.now(),
            )

    return purchase


def get_topup_purchase_status(checkout_session_id: str, user) -> TopupPurchase:
    """The topup purchase for a checkout session, scoped to the requesting user."""

    purchase = TopupPurchase.objects.select_related("pack").filter(
        stripe_checkout_session_id=checkout_session_id,
        user=user,
    ).first()

    if purchase is None:
        raise PaymentError(
            "Topup purchase record not found.",
            code="topup_purchase_not_found",
        )

    if purchase.status == TopupPurchase.Status.CREATED:
        _reconcile_with_stripe(
            checkout_session_id,
            lambda session: handle_topup_checkout_completed(session),
        )
        purchase.refresh_from_db()

    return purchase


# --------------------------------------------------
# Failed / expired checkouts and Stripe reconciliation
# --------------------------------------------------

def handle_checkout_failed(session_data) -> None:
    """A checkout session expired or its delayed payment failed."""

    session_id = _to_dict(session_data).get("id")
    now = timezone.now()

    Payment.objects.filter(
        stripe_checkout_session_id=session_id,
        status=Payment.Status.CREATED,
    ).update(status=Payment.Status.FAILED, updated_at=now)

    TopupPurchase.objects.filter(
        stripe_checkout_session_id=session_id,
        status=TopupPurchase.Status.CREATED,
    ).update(status=TopupPurchase.Status.FAILED, updated_at=now)


def _reconcile_with_stripe(checkout_session_id: str, on_paid) -> None:
    """Ask Stripe for the session state and apply it. Never raises."""

    try:
        _configure_stripe()
        session = stripe.checkout.Session.retrieve(checkout_session_id)
        session_dict = _to_dict(session)

        if session_dict.get("payment_status") == "paid":
            on_paid(session)
        elif session_dict.get("status") == "expired":
            handle_checkout_failed(session)

    except (PaymentError, StripeError) as error:
        logger.warning("Could not reconcile session %s: %s", checkout_session_id, error)


# --------------------------------------------------
# Billing history
# --------------------------------------------------

def get_payment_history(user, limit: int = 50) -> list[dict]:
    """Plan payments and topup purchases of one user, newest first."""

    items = []

    for payment in Payment.objects.filter(user=user).select_related("plan")[:limit]:
        items.append(
            {
                "id": f"plan-{payment.pk}",
                "kind": "PLAN",
                "description": f"{payment.plan.name} plan",
                "amount": payment.amount,
                "currency": payment.currency,
                "status": payment.status,
                "created_at": payment.created_at,
            }
        )

    for purchase in TopupPurchase.objects.filter(user=user).select_related("pack")[:limit]:
        items.append(
            {
                "id": f"topup-{purchase.pk}",
                "kind": "TOPUP",
                "description": purchase.pack.name,
                "amount": purchase.amount,
                "currency": CURRENCY.upper(),
                "status": purchase.status,
                "created_at": purchase.created_at,
            }
        )

    items.sort(key=lambda item: item["created_at"], reverse=True)

    return items[:limit]
