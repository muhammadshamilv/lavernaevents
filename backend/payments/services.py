# backend/payments/services.py
"""Online payments through Cashfree (UPI QR / UPI apps / cards / netbanking).

Flow
----
1. ``create_checkout_session`` / ``create_topup_checkout_session`` create a
   Cashfree ORDER and store a CREATED payment row. The browser gets the
   order's ``payment_session_id`` and opens Cashfree's hosted checkout (which
   shows a UPI QR on desktop and UPI app buttons on phones).
2. Money is only ever trusted from Cashfree itself: the signed webhook and
   the status page both RE-FETCH the order from Cashfree's API and only act
   when it says PAID for the right amount. The browser redirect alone never
   activates anything.
3. Every settle step is idempotent, so webhook retries and the status poll
   can race safely.

Note on names: the database columns keep their old names
(``stripe_checkout_session_id`` / ``stripe_payment_intent_id``) so no
migration is needed. They now hold the Cashfree ORDER ID and the Cashfree
PAYMENT ID. The API exposes the order id as ``order_id``.
"""

import base64
import hashlib
import hmac
import logging
import re
import uuid
from decimal import Decimal, InvalidOperation

import requests
from django.conf import settings
from django.db import models as dj_models
from django.db import transaction
from django.utils import timezone

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

CURRENCY = "INR"

API_BASE_URLS = {
    "sandbox": "https://sandbox.cashfree.com/pg",
    "production": "https://api.cashfree.com/pg",
}

REQUEST_TIMEOUT_SECONDS = 20

PLAN_ORDER_PREFIX = "PLAN_"
TOPUP_ORDER_PREFIX = "TOPUP_"

# A Cashfree order that can never be paid any more.
DEAD_ORDER_STATES = frozenset({"EXPIRED", "TERMINATED", "TERMINATION_REQUESTED"})


class PaymentError(Exception):
    """Raised when a payment action cannot be completed."""

    def __init__(self, message: str, code: str = "payment_error"):
        self.message = message
        self.code = code
        super().__init__(message)


# --------------------------------------------------
# Cashfree API helpers
# --------------------------------------------------

def get_cashfree_mode() -> str:
    """"sandbox" (test money) or "production" (real money)."""

    value = (getattr(settings, "CASHFREE_ENV", "") or "sandbox").strip().lower()

    return "production" if value in ("production", "prod", "live") else "sandbox"


def _credentials() -> tuple[str, str]:
    app_id = getattr(settings, "CASHFREE_APP_ID", "")
    secret = getattr(settings, "CASHFREE_SECRET_KEY", "")

    if not app_id or not secret:
        raise PaymentError(
            "Online payments are not configured yet. Please contact support.",
            code="payments_not_configured",
        )

    return app_id, secret


def _cashfree_request(method: str, path: str, payload: dict | None = None):
    """One call to the Cashfree PG API. Raises PaymentError(gateway_error)."""

    app_id, secret = _credentials()

    headers = {
        "x-client-id": app_id,
        "x-client-secret": secret,
        "x-api-version": getattr(settings, "CASHFREE_API_VERSION", "") or "2025-01-01",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }

    url = f"{API_BASE_URLS[get_cashfree_mode()]}{path}"

    try:
        response = requests.request(
            method,
            url,
            json=payload,
            headers=headers,
            timeout=REQUEST_TIMEOUT_SECONDS,
        )
    except requests.RequestException as error:
        logger.error("Cashfree %s %s failed: %s", method, path, error)

        raise PaymentError(
            "We couldn't reach the payment service. Please try again in a moment.",
            code="gateway_error",
        ) from error

    if response.status_code >= 400:
        logger.error(
            "Cashfree %s %s returned %s: %s",
            method,
            path,
            response.status_code,
            response.text[:300],
        )

        raise PaymentError(
            "We couldn't start the payment. Please try again in a moment.",
            code="gateway_error",
        )

    try:
        return response.json()
    except ValueError as error:
        logger.error("Cashfree %s %s returned a non-JSON body.", method, path)

        raise PaymentError(
            "The payment service sent an unexpected answer. Please try again.",
            code="gateway_error",
        ) from error


def _new_order_id(prefix: str) -> str:
    # Cashfree allows letters, digits, "_" and "-", up to 50 characters.
    return f"{prefix}{uuid.uuid4().hex}"


def _money(value) -> Decimal:
    return Decimal(str(value)).quantize(Decimal("0.01"))


def _parse_amount(value) -> Decimal | None:
    try:
        return _money(value)
    except (InvalidOperation, ValueError, TypeError):
        return None


def _amount_matches(order: dict, expected_price) -> bool:
    """The order Cashfree reports must be for exactly the price we asked for."""

    paid = _parse_amount(order.get("order_amount"))
    currency = (order.get("order_currency") or CURRENCY).upper()

    return paid is not None and paid == _money(expected_price) and currency == CURRENCY


def _customer_details(user) -> dict:
    digits = re.sub(r"\D", "", getattr(user, "mobile_number", "") or "")[-10:]

    if len(digits) < 10:
        raise PaymentError(
            "Your mobile number looks incomplete. Please update it and try again.",
            code="invalid_mobile",
        )

    details = {
        "customer_id": f"user_{user.pk}",
        "customer_phone": digits,
    }

    if getattr(user, "email", ""):
        details["customer_email"] = user.email

    if getattr(user, "full_name", ""):
        details["customer_name"] = user.full_name[:100]

    return details


def _create_cashfree_order(user, order_id: str, price, return_url: str) -> dict:
    """Create the order at Cashfree; returns the checkout info for the browser."""

    order_meta = {"return_url": return_url}

    # Cashfree calls this URL after each payment. It only works from a public
    # https address, so it is skipped on a local machine (the status page
    # still confirms the payment by asking Cashfree directly).
    backend_url = (getattr(settings, "PUBLIC_BACKEND_URL", "") or "").rstrip("/")

    if backend_url.startswith("https://"):
        order_meta["notify_url"] = f"{backend_url}/api/payments/webhook/"

    data = _cashfree_request(
        "POST",
        "/orders",
        {
            "order_id": order_id,
            "order_amount": float(_money(price)),
            "order_currency": CURRENCY,
            "customer_details": _customer_details(user),
            "order_meta": order_meta,
        },
    )

    session_id = data.get("payment_session_id")

    # Use the session id EXACTLY as Cashfree returned it. Never trim or edit
    # it (Cashfree support: even a "...paymentpayment" ending is valid).
    if not session_id or data.get("order_id") != order_id:
        logger.error("Cashfree create-order reply is missing fields: %s", list(data))

        raise PaymentError(
            "We couldn't start the payment. Please try again in a moment.",
            code="gateway_error",
        )

    # Only the length and the last few characters are logged (never the whole
    # id), enough to spot a malformed session id when debugging checkout.
    logger.info(
        "Cashfree order %s created (mode=%s, session id length=%s, ends with %r)",
        order_id,
        get_cashfree_mode(),
        len(session_id),
        session_id[-12:],
    )

    return {
        "order_id": order_id,
        "payment_session_id": session_id,
        "cashfree_mode": get_cashfree_mode(),
    }


def _fetch_order(order_id: str) -> dict:
    return _cashfree_request("GET", f"/orders/{order_id}")


def _fetch_success_payment_id(order_id: str) -> str:
    """The Cashfree payment id of the successful attempt. Best effort."""

    try:
        attempts = _cashfree_request("GET", f"/orders/{order_id}/payments")
    except PaymentError:
        return ""

    for attempt in attempts if isinstance(attempts, list) else []:
        if (attempt.get("payment_status") or "").upper() == "SUCCESS":
            return str(attempt.get("cf_payment_id") or "")

    return ""


def _check_purchaser(user) -> None:
    try:
        check_can_purchase(user)
    except SubscriptionError as error:
        raise PaymentError(error.message, code=error.code) from error


# --------------------------------------------------
# Plan purchases
# --------------------------------------------------

def create_checkout_session(user, plan_slug: str, return_url: str):
    """Create a Cashfree order for a PAID membership plan.

    ``return_url`` is where Cashfree sends the customer afterwards (it must
    already contain the order id - see the view).
    Returns (payment, checkout_info).
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

    order_id = _new_order_id(PLAN_ORDER_PREFIX)

    info = _create_cashfree_order(user, order_id, plan.price, return_url.format(order_id=order_id))

    payment = Payment.objects.create(
        user=user,
        plan=plan,
        stripe_checkout_session_id=order_id,
        amount=plan.price,
        currency=CURRENCY,
        status=Payment.Status.CREATED,
    )

    return payment, info


def _settle_plan(payment: Payment, order: dict, order_status: str, cf_payment_id: str) -> Payment:
    if payment.status == Payment.Status.PAID:
        return payment

    if order_status == "PAID":
        if not _amount_matches(order, payment.amount):
            logger.error(
                "Cashfree amount mismatch for order %s: expected %s, got %s",
                payment.stripe_checkout_session_id,
                payment.amount,
                order.get("order_amount"),
            )
            raise PaymentError(
                "The paid amount does not match the plan price.",
                code="amount_mismatch",
            )

        payment.status = Payment.Status.PAID
        payment.stripe_payment_intent_id = cf_payment_id or payment.stripe_payment_intent_id
        payment.save(update_fields=["status", "stripe_payment_intent_id", "updated_at"])

        activate_plan_for_user(payment.user, payment.plan)

    elif order_status in DEAD_ORDER_STATES and payment.status == Payment.Status.CREATED:
        payment.status = Payment.Status.FAILED
        payment.save(update_fields=["status", "updated_at"])

    return payment


def get_payment_status(order_id: str, user) -> Payment:
    """The payment for an order, scoped to the requesting user.

    If it is still CREATED, Cashfree is asked directly, so the page works
    even when the webhook is slow or cannot reach this server (local dev).
    """

    payment = Payment.objects.select_related("plan").filter(
        stripe_checkout_session_id=order_id,
        user=user,
    ).first()

    if payment is None:
        raise PaymentError("Payment record not found.", code="payment_not_found")

    if payment.status == Payment.Status.CREATED:
        _reconcile_with_cashfree(order_id)
        payment.refresh_from_db()

    return payment


# --------------------------------------------------
# Topup pack purchases
# --------------------------------------------------

def create_topup_checkout_session(user, pack_id: int, return_url: str):
    """Create a Cashfree order for a TopupPack. Returns (purchase, checkout_info)."""

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

    order_id = _new_order_id(TOPUP_ORDER_PREFIX)

    info = _create_cashfree_order(user, order_id, pack.price, return_url.format(order_id=order_id))

    purchase = TopupPurchase.objects.create(
        user=user,
        pack=pack,
        stripe_checkout_session_id=order_id,
        amount=pack.price,
        status=TopupPurchase.Status.CREATED,
    )

    return purchase, info


def _settle_topup(
    purchase: TopupPurchase, order: dict, order_status: str, cf_payment_id: str
) -> TopupPurchase:
    if purchase.status == TopupPurchase.Status.PAID:
        return purchase

    if order_status == "PAID":
        if not _amount_matches(order, purchase.amount):
            logger.error(
                "Cashfree amount mismatch for topup order %s: expected %s, got %s",
                purchase.stripe_checkout_session_id,
                purchase.amount,
                order.get("order_amount"),
            )
            raise PaymentError(
                "The paid amount does not match the pack price.",
                code="amount_mismatch",
            )

        purchase.status = TopupPurchase.Status.PAID
        purchase.stripe_payment_intent_id = cf_payment_id or purchase.stripe_payment_intent_id
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

    elif order_status in DEAD_ORDER_STATES and purchase.status == TopupPurchase.Status.CREATED:
        purchase.status = TopupPurchase.Status.FAILED
        purchase.save(update_fields=["status", "updated_at"])

    return purchase


def get_topup_purchase_status(order_id: str, user) -> TopupPurchase:
    """The topup purchase for an order, scoped to the requesting user."""

    purchase = TopupPurchase.objects.select_related("pack").filter(
        stripe_checkout_session_id=order_id,
        user=user,
    ).first()

    if purchase is None:
        raise PaymentError(
            "Topup purchase record not found.",
            code="topup_purchase_not_found",
        )

    if purchase.status == TopupPurchase.Status.CREATED:
        _reconcile_with_cashfree(order_id)
        purchase.refresh_from_db()

    return purchase


# --------------------------------------------------
# Settling an order (plan OR topup) from Cashfree's own data
# --------------------------------------------------

def _record_exists(order_id: str) -> bool:
    return (
        Payment.objects.filter(stripe_checkout_session_id=order_id).exists()
        or TopupPurchase.objects.filter(stripe_checkout_session_id=order_id).exists()
    )


def settle_order(order: dict, cf_payment_id: str = ""):
    """Apply Cashfree's view of an order to our records. Idempotent.

    ``order`` must be the answer of Cashfree's "Get Order" call, never data
    that came straight from a browser or an unverified request.
    """

    order_id = order.get("order_id")
    order_status = (order.get("order_status") or "").upper()

    with transaction.atomic():
        payment = (
            Payment.objects.select_for_update(of=("self",))
            .select_related("plan", "user")
            .filter(stripe_checkout_session_id=order_id)
            .first()
        )

        if payment is not None:
            return _settle_plan(payment, order, order_status, cf_payment_id)

        purchase = (
            TopupPurchase.objects.select_for_update(of=("self",))
            .select_related("pack", "user")
            .filter(stripe_checkout_session_id=order_id)
            .first()
        )

        if purchase is not None:
            return _settle_topup(purchase, order, order_status, cf_payment_id)

    raise PaymentError(
        "No payment record found for this order.",
        code="payment_not_found",
    )


def _reconcile_with_cashfree(order_id: str) -> None:
    """Ask Cashfree for the order state and apply it. Never raises."""

    try:
        order = _fetch_order(order_id)
        order_status = (order.get("order_status") or "").upper()

        if order_status == "PAID":
            settle_order(order, _fetch_success_payment_id(order_id))
        elif order_status in DEAD_ORDER_STATES:
            settle_order(order)

    except PaymentError as error:
        logger.warning("Could not reconcile order %s: %s", order_id, error)


# --------------------------------------------------
# Webhook
# --------------------------------------------------

def verify_webhook_signature(raw_body: bytes, timestamp: str, signature: str) -> bool:
    """Check Cashfree's ``x-webhook-signature``.

    The signature is base64(HMAC-SHA256(secret key, timestamp + raw body)).
    The raw bytes must be used, never re-serialised JSON. A "timestamp.body"
    variant shown in some of Cashfree's pseudo-code is accepted too; both
    are keyed with the secret, so neither can be forged.
    """

    secret = getattr(settings, "CASHFREE_SECRET_KEY", "")

    if not secret or not timestamp or not signature:
        return False

    stamp = timestamp.encode()

    for message in (stamp + raw_body, stamp + b"." + raw_body):
        digest = base64.b64encode(
            hmac.new(secret.encode(), message, hashlib.sha256).digest()
        ).decode()

        if hmac.compare_digest(digest, signature.strip()):
            return True

    return False


def handle_webhook_event(payload: dict) -> None:
    """Process one verified webhook. Raises PaymentError(gateway_error) when
    Cashfree could not be asked, so the view can answer 5xx and Cashfree retries.

    Only a successful payment changes anything. A failed attempt does NOT end
    the order (the customer can retry on the same checkout), and expired
    orders are picked up by the status page.
    """

    event_type = payload.get("type", "")
    data = payload.get("data") or {}
    order_id = (data.get("order") or {}).get("order_id")

    if event_type != "PAYMENT_SUCCESS_WEBHOOK" or not order_id:
        logger.info("Cashfree webhook ignored: %s", event_type or "no type")
        return

    if not _record_exists(order_id):
        logger.warning("Cashfree webhook for an unknown order: %s", order_id)
        return

    # Never trust the webhook body for money: ask Cashfree.
    order = _fetch_order(order_id)
    cf_payment_id = str((data.get("payment") or {}).get("cf_payment_id") or "")

    settle_order(order, cf_payment_id or _fetch_success_payment_id(order_id))


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
                "currency": CURRENCY,
                "status": purchase.status,
                "created_at": purchase.created_at,
            }
        )

    items.sort(key=lambda item: item["created_at"], reverse=True)

    return items[:limit]