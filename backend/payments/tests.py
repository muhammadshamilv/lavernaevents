# backend/payments/tests.py
"""Cashfree payment flow tests. No real Cashfree call and no real money:
every network call goes through a patched ``_cashfree_request``.

Run:  python manage.py test payments
"""

import base64
import hashlib
import hmac
import json
from datetime import timedelta
from decimal import Decimal
from unittest import mock

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from memberships.models import MembershipPlan, Subscription
from memberships.topup_models import TopupPack, TopupPurchase

from . import services
from .models import Payment
from .services import PaymentError

SECRET = "test-secret-key"


def _sign(body: bytes, timestamp: str = "1700000000000") -> str:
    digest = hmac.new(SECRET.encode(), timestamp.encode() + body, hashlib.sha256).digest()
    return base64.b64encode(digest).decode()


@override_settings(
    CASHFREE_APP_ID="test-app-id",
    CASHFREE_SECRET_KEY=SECRET,
    CASHFREE_ENV="sandbox",
    FRONTEND_URL="https://app.example.com",
    PUBLIC_BACKEND_URL="https://api.example.com",
)
class CashfreeTestBase(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            mobile_number="9000000051",
            password="Strong@Pass91",
            full_name="Org One",
            email="org51@example.com",
        )
        # Only verified organizer accounts may buy (see check_can_purchase).
        self.user.role = "ORGANIZER"
        self.user.is_verified = True
        self.user.save()
        self.plan = MembershipPlan.objects.create(
            name="Gold", slug="gold", price=Decimal("999.00"), total_invitations=100, voice_call_limit=10
        )
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def fake_cashfree(self, order_status="PAID", amount="999.00", payments=None):
        """A stand-in for ``_cashfree_request`` that records every call."""

        calls = []

        def fake(method, path, payload=None):
            calls.append((method, path, payload))

            if method == "POST" and path == "/orders":
                return {"order_id": payload["order_id"], "payment_session_id": "session_abc"}

            if method == "GET" and path.endswith("/payments"):
                return payments if payments is not None else [
                    {"payment_status": "FAILED", "cf_payment_id": 1},
                    {"payment_status": "SUCCESS", "cf_payment_id": 777},
                ]

            if method == "GET":
                return {
                    "order_id": path.rsplit("/", 1)[-1],
                    "order_status": order_status,
                    "order_amount": amount,
                    "order_currency": "INR",
                }

            raise AssertionError(f"unexpected call {method} {path}")

        patcher = mock.patch.object(services, "_cashfree_request", side_effect=fake)
        patcher.start()
        self.addCleanup(patcher.stop)

        return calls

    def start_plan_payment(self):
        self.fake_cashfree(order_status="ACTIVE")
        response = self.client.post(
            "/api/payments/create-checkout-session/", {"plan_slug": "gold"}, format="json"
        )
        self.assertEqual(response.status_code, 201, response.content)
        return response.json()["data"]["order_id"]


class CreateOrderTests(CashfreeTestBase):
    def test_creates_order_and_returns_checkout_info(self):
        calls = self.fake_cashfree(order_status="ACTIVE")

        response = self.client.post(
            "/api/payments/create-checkout-session/", {"plan_slug": "gold"}, format="json"
        )

        self.assertEqual(response.status_code, 201)
        data = response.json()["data"]
        self.assertEqual(data["payment_session_id"], "session_abc")
        self.assertEqual(data["cashfree_mode"], "sandbox")
        self.assertTrue(data["order_id"].startswith("PLAN_"))

        method, path, payload = calls[0]
        self.assertEqual((method, path), ("POST", "/orders"))
        self.assertEqual(payload["order_amount"], 999.0)
        self.assertEqual(payload["order_currency"], "INR")
        self.assertEqual(payload["customer_details"]["customer_phone"], "9000000051")
        self.assertEqual(
            payload["order_meta"]["return_url"],
            f"https://app.example.com/payment/success?session_id={data['order_id']}",
        )
        self.assertEqual(
            payload["order_meta"]["notify_url"], "https://api.example.com/api/payments/webhook/"
        )

        payment = Payment.objects.get(stripe_checkout_session_id=data["order_id"])
        self.assertEqual(payment.status, Payment.Status.CREATED)
        self.assertEqual(payment.amount, Decimal("999.00"))

    def test_session_id_is_passed_on_unchanged(self):
        def fake(method, path, payload=None):
            return {"order_id": payload["order_id"], "payment_session_id": "session_xyzpaymentpayment"}

        with mock.patch.object(services, "_cashfree_request", side_effect=fake):
            response = self.client.post(
                "/api/payments/create-checkout-session/", {"plan_slug": "gold"}, format="json"
            )

        self.assertEqual(response.json()["data"]["payment_session_id"], "session_xyzpaymentpayment")

    @override_settings(PUBLIC_BACKEND_URL="http://localhost:8000")
    def test_notify_url_skipped_on_local_http(self):
        calls = self.fake_cashfree(order_status="ACTIVE")
        self.client.post("/api/payments/create-checkout-session/", {"plan_slug": "gold"}, format="json")
        self.assertNotIn("notify_url", calls[0][2]["order_meta"])

    def test_free_plan_is_refused(self):
        MembershipPlan.objects.create(name="Free", slug="free", price=0)
        self.fake_cashfree()
        response = self.client.post("/api/payments/create-checkout-session/", {"plan_slug": "free"}, format="json")
        self.assertEqual(response.status_code, 400)

    def test_unknown_plan_is_404(self):
        self.fake_cashfree()
        response = self.client.post("/api/payments/create-checkout-session/", {"plan_slug": "nope"}, format="json")
        self.assertEqual(response.status_code, 404)

    @override_settings(CASHFREE_SECRET_KEY="")
    def test_not_configured_is_503(self):
        response = self.client.post("/api/payments/create-checkout-session/", {"plan_slug": "gold"}, format="json")
        self.assertEqual(response.status_code, 503)

    def test_gateway_failure_is_502_and_stores_nothing(self):
        with mock.patch.object(
            services, "_cashfree_request", side_effect=PaymentError("down", code="gateway_error")
        ):
            response = self.client.post(
                "/api/payments/create-checkout-session/", {"plan_slug": "gold"}, format="json"
            )
        self.assertEqual(response.status_code, 502)
        self.assertEqual(Payment.objects.count(), 0)

    def test_short_mobile_number_is_refused(self):
        self.user.mobile_number = "123"
        self.user.save()
        self.fake_cashfree()
        response = self.client.post("/api/payments/create-checkout-session/", {"plan_slug": "gold"}, format="json")
        self.assertEqual(response.status_code, 400)

    def test_requires_login(self):
        response = APIClient().post("/api/payments/create-checkout-session/", {"plan_slug": "gold"}, format="json")
        self.assertIn(response.status_code, (401, 403))


class StatusTests(CashfreeTestBase):
    def test_paid_order_activates_plan_once(self):
        order_id = self.start_plan_payment()
        calls = self.fake_cashfree(order_status="PAID")

        with mock.patch.object(services, "activate_plan_for_user") as activate:
            first = self.client.get(f"/api/payments/status/{order_id}/")
            second = self.client.get(f"/api/payments/status/{order_id}/")

        self.assertEqual(first.json()["data"]["status"], "PAID")
        self.assertEqual(first.json()["data"]["order_id"], order_id)
        self.assertEqual(second.json()["data"]["status"], "PAID")
        activate.assert_called_once()
        self.assertEqual(Payment.objects.get().stripe_payment_intent_id, "777")
        # second poll must not ask Cashfree again
        self.assertEqual(len([c for c in calls if c[1] == f"/orders/{order_id}"]), 1)

    def test_still_active_order_stays_created(self):
        order_id = self.start_plan_payment()
        self.fake_cashfree(order_status="ACTIVE")
        with mock.patch.object(services, "activate_plan_for_user") as activate:
            response = self.client.get(f"/api/payments/status/{order_id}/")
        self.assertEqual(response.json()["data"]["status"], "CREATED")
        activate.assert_not_called()

    def test_expired_order_becomes_failed(self):
        order_id = self.start_plan_payment()
        self.fake_cashfree(order_status="EXPIRED")
        response = self.client.get(f"/api/payments/status/{order_id}/")
        self.assertEqual(response.json()["data"]["status"], "FAILED")

    def test_wrong_amount_is_never_activated(self):
        order_id = self.start_plan_payment()
        self.fake_cashfree(order_status="PAID", amount="1.00")
        with mock.patch.object(services, "activate_plan_for_user") as activate:
            response = self.client.get(f"/api/payments/status/{order_id}/")
        self.assertEqual(response.json()["data"]["status"], "CREATED")
        activate.assert_not_called()

    def test_gateway_down_during_poll_does_not_crash(self):
        order_id = self.start_plan_payment()
        with mock.patch.object(
            services, "_cashfree_request", side_effect=PaymentError("down", code="gateway_error")
        ):
            response = self.client.get(f"/api/payments/status/{order_id}/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["data"]["status"], "CREATED")

    def test_other_users_order_is_404(self):
        order_id = self.start_plan_payment()
        other = get_user_model().objects.create_user(
            mobile_number="9000000052",
            password="Strong@Pass91",
            full_name="Org Two",
            email="org52@example.com",
        )
        client = APIClient()
        client.force_authenticate(other)
        self.fake_cashfree(order_status="PAID")
        self.assertEqual(client.get(f"/api/payments/status/{order_id}/").status_code, 404)


class WebhookTests(CashfreeTestBase):
    def post_webhook(self, payload, signature=None, timestamp="1700000000000"):
        body = json.dumps(payload).encode()
        return APIClient().post(
            "/api/payments/webhook/",
            data=body,
            content_type="application/json",
            HTTP_X_WEBHOOK_SIGNATURE=signature if signature is not None else _sign(body, timestamp),
            HTTP_X_WEBHOOK_TIMESTAMP=timestamp,
        )

    @staticmethod
    def success_event(order_id):
        return {
            "type": "PAYMENT_SUCCESS_WEBHOOK",
            "data": {"order": {"order_id": order_id}, "payment": {"cf_payment_id": 555}},
        }

    def test_valid_signed_success_activates_plan(self):
        order_id = self.start_plan_payment()
        self.fake_cashfree(order_status="PAID")

        with mock.patch.object(services, "activate_plan_for_user") as activate:
            response = self.post_webhook(self.success_event(order_id))

        self.assertEqual(response.status_code, 200)
        activate.assert_called_once()
        payment = Payment.objects.get()
        self.assertEqual(payment.status, Payment.Status.PAID)
        self.assertEqual(payment.stripe_payment_intent_id, "555")

    def test_repeated_delivery_is_harmless(self):
        order_id = self.start_plan_payment()
        self.fake_cashfree(order_status="PAID")

        with mock.patch.object(services, "activate_plan_for_user") as activate:
            self.post_webhook(self.success_event(order_id))
            self.post_webhook(self.success_event(order_id))

        activate.assert_called_once()

    def test_bad_signature_is_refused_and_changes_nothing(self):
        order_id = self.start_plan_payment()
        self.fake_cashfree(order_status="PAID")

        with mock.patch.object(services, "activate_plan_for_user") as activate:
            response = self.post_webhook(self.success_event(order_id), signature="AAAA")

        self.assertEqual(response.status_code, 400)
        activate.assert_not_called()
        self.assertEqual(Payment.objects.get().status, Payment.Status.CREATED)

    def test_missing_signature_headers_are_refused(self):
        response = APIClient().post(
            "/api/payments/webhook/", data=b"{}", content_type="application/json"
        )
        self.assertEqual(response.status_code, 400)

    def test_tampered_body_is_refused(self):
        order_id = self.start_plan_payment()
        good = json.dumps(self.success_event(order_id)).encode()
        evil = json.dumps(self.success_event(order_id + "x")).encode()
        response = APIClient().post(
            "/api/payments/webhook/",
            data=evil,
            content_type="application/json",
            HTTP_X_WEBHOOK_SIGNATURE=_sign(good),
            HTTP_X_WEBHOOK_TIMESTAMP="1700000000000",
        )
        self.assertEqual(response.status_code, 400)

    def test_webhook_never_trusts_its_own_amount(self):
        order_id = self.start_plan_payment()
        self.fake_cashfree(order_status="ACTIVE")  # Cashfree says: not paid

        with mock.patch.object(services, "activate_plan_for_user") as activate:
            response = self.post_webhook(self.success_event(order_id))

        self.assertEqual(response.status_code, 200)
        activate.assert_not_called()

    def test_failed_payment_event_does_not_fail_the_order(self):
        order_id = self.start_plan_payment()
        self.fake_cashfree(order_status="ACTIVE")
        response = self.post_webhook(
            {"type": "PAYMENT_FAILED_WEBHOOK", "data": {"order": {"order_id": order_id}}}
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(Payment.objects.get().status, Payment.Status.CREATED)

    def test_unknown_order_is_acknowledged(self):
        self.fake_cashfree(order_status="PAID")
        self.assertEqual(self.post_webhook(self.success_event("PLAN_unknown")).status_code, 200)

    def test_gateway_down_asks_cashfree_to_retry(self):
        order_id = self.start_plan_payment()
        with mock.patch.object(
            services, "_cashfree_request", side_effect=PaymentError("down", code="gateway_error")
        ):
            response = self.post_webhook(self.success_event(order_id))
        self.assertEqual(response.status_code, 503)

    def test_dotted_signature_variant_is_accepted(self):
        order_id = self.start_plan_payment()
        self.fake_cashfree(order_status="PAID")
        body = json.dumps(self.success_event(order_id)).encode()
        digest = hmac.new(SECRET.encode(), b"1700000000000." + body, hashlib.sha256).digest()
        with mock.patch.object(services, "activate_plan_for_user"):
            response = APIClient().post(
                "/api/payments/webhook/",
                data=body,
                content_type="application/json",
                HTTP_X_WEBHOOK_SIGNATURE=base64.b64encode(digest).decode(),
                HTTP_X_WEBHOOK_TIMESTAMP="1700000000000",
            )
        self.assertEqual(response.status_code, 200)

    @override_settings(CASHFREE_SECRET_KEY="")
    def test_unconfigured_webhook_is_503(self):
        self.assertEqual(self.post_webhook({"type": "x"}, signature="a").status_code, 503)


class TopupTests(CashfreeTestBase):
    def setUp(self):
        super().setUp()
        self.subscription = Subscription.objects.create(
            user=self.user, plan=self.plan, expires_at=timezone.now() + timedelta(days=30)
        )
        self.pack = TopupPack.objects.create(
            name="50 invites", kind=TopupPack.Kind.INVITATIONS, quantity=50, price=Decimal("199.00")
        )

    def start_topup(self):
        self.fake_cashfree(order_status="ACTIVE")
        response = self.client.post(
            "/api/payments/topup/create-checkout-session/", {"pack_id": self.pack.pk}, format="json"
        )
        self.assertEqual(response.status_code, 201, response.content)
        return response.json()["data"]["order_id"]

    def test_topup_order_uses_topup_return_url(self):
        calls = self.fake_cashfree(order_status="ACTIVE")
        response = self.client.post(
            "/api/payments/topup/create-checkout-session/", {"pack_id": self.pack.pk}, format="json"
        )
        order_id = response.json()["data"]["order_id"]
        self.assertTrue(order_id.startswith("TOPUP_"))
        self.assertEqual(
            calls[0][2]["order_meta"]["return_url"],
            f"https://app.example.com/payment/topup-success?session_id={order_id}",
        )

    def test_paid_topup_credits_exactly_once(self):
        order_id = self.start_topup()
        self.fake_cashfree(order_status="PAID", amount="199.00")

        self.client.get(f"/api/payments/topup/status/{order_id}/")
        response = self.client.get(f"/api/payments/topup/status/{order_id}/")

        self.assertEqual(response.json()["data"]["status"], "PAID")
        self.assertEqual(response.json()["data"]["order_id"], order_id)
        self.subscription.refresh_from_db()
        self.assertEqual(self.subscription.invitations_topup, 50)

    def test_topup_via_webhook_then_poll_credits_once(self):
        order_id = self.start_topup()
        self.fake_cashfree(order_status="PAID", amount="199.00")
        body = json.dumps(WebhookTests.success_event(order_id)).encode()

        APIClient().post(
            "/api/payments/webhook/", data=body, content_type="application/json",
            HTTP_X_WEBHOOK_SIGNATURE=_sign(body), HTTP_X_WEBHOOK_TIMESTAMP="1700000000000",
        )
        self.client.get(f"/api/payments/topup/status/{order_id}/")

        self.subscription.refresh_from_db()
        self.assertEqual(self.subscription.invitations_topup, 50)

    def test_topup_wrong_amount_not_credited(self):
        order_id = self.start_topup()
        self.fake_cashfree(order_status="PAID", amount="1.00")
        self.client.get(f"/api/payments/topup/status/{order_id}/")
        self.subscription.refresh_from_db()
        self.assertEqual(self.subscription.invitations_topup, 0)
        self.assertEqual(TopupPurchase.objects.get().status, TopupPurchase.Status.CREATED)

    def test_topup_needs_active_plan(self):
        Subscription.objects.all().delete()
        self.fake_cashfree()
        response = self.client.post(
            "/api/payments/topup/create-checkout-session/", {"pack_id": self.pack.pk}, format="json"
        )
        self.assertEqual(response.status_code, 409)


class HistoryAndSignatureTests(CashfreeTestBase):
    def test_history_lists_plan_payments(self):
        self.start_plan_payment()
        response = self.client.get("/api/payments/history/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["data"][0]["kind"], "PLAN")

    def test_signature_helper_rejects_empty_inputs(self):
        self.assertFalse(services.verify_webhook_signature(b"{}", "", "x"))
        self.assertFalse(services.verify_webhook_signature(b"{}", "1", ""))

    def test_mode_defaults_to_sandbox(self):
        with override_settings(CASHFREE_ENV="whatever"):
            self.assertEqual(services.get_cashfree_mode(), "sandbox")
        with override_settings(CASHFREE_ENV="PRODUCTION"):
            self.assertEqual(services.get_cashfree_mode(), "production")