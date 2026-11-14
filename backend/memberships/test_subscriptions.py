"""Subscription expiry, renewal and portal-access tests.

No outside service is involved. Run:
    python manage.py test memberships --settings=config.test_settings
"""

from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from .models import MembershipPlan, Subscription

PORTAL_ACCESS_URL = reverse("portal-access")


def make_organizer(mobile="9000000101", verified=True):
    user = get_user_model().objects.create_user(
        mobile_number=mobile,
        password="Strong@Pass91",
        full_name="Test Organizer",
        email=f"org{mobile}@example.com",
    )
    user.role = "ORGANIZER"
    user.is_verified = verified
    user.save()
    return user


def make_subscription(user, plan, *, days_left, status=Subscription.Status.ACTIVE, **extra):
    """A subscription ending `days_left` days from now (negative = in the past)."""

    return Subscription.objects.create(
        user=user,
        plan=plan,
        status=status,
        expires_at=timezone.now() + timedelta(days=days_left),
        **extra,
    )


class SubscriptionTestBase(TestCase):
    def setUp(self):
        self.user = make_organizer()
        self.free = MembershipPlan.objects.create(
            name="Free", slug="free", price=Decimal("0"), duration_days=30,
            total_invitations=50, voice_call_limit=0,
        )
        self.gold = MembershipPlan.objects.create(
            name="Gold", slug="gold", price=Decimal("999.00"), duration_days=30,
            total_invitations=100, voice_call_limit=10,
        )
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def portal_access(self):
        response = self.client.get(PORTAL_ACCESS_URL)
        self.assertEqual(response.status_code, 200)
        return response.json()["data"]


class PortalAccessTests(SubscriptionTestBase):
    def test_never_subscribed_is_sent_to_select_plan_without_expiry(self):
        data = self.portal_access()

        self.assertFalse(data["can_access_portal"])
        self.assertEqual(data["next_step"], "select_plan")
        self.assertFalse(data["plan_expired"])
        self.assertIsNone(data["expired_subscription"])

    def test_active_plan_opens_the_portal(self):
        make_subscription(self.user, self.gold, days_left=10)

        data = self.portal_access()

        self.assertTrue(data["can_access_portal"])
        self.assertIsNone(data["next_step"])
        self.assertFalse(data["plan_expired"])
        self.assertIsNone(data["expired_subscription"])

    def test_overdue_plan_reports_expiry_with_plan_and_date(self):
        sub = make_subscription(self.user, self.gold, days_left=-2)

        data = self.portal_access()

        self.assertFalse(data["can_access_portal"])
        self.assertEqual(data["next_step"], "select_plan")
        self.assertTrue(data["plan_expired"])
        self.assertEqual(data["expired_subscription"]["plan_name"], "Gold")
        self.assertEqual(data["expired_subscription"]["plan_slug"], "gold")
        self.assertIsNotNone(data["expired_subscription"]["expired_at"])

        # The overdue row is tidied to EXPIRED on read.
        sub.refresh_from_db()
        self.assertEqual(sub.status, Subscription.Status.EXPIRED)

    def test_plan_ending_one_second_ago_counts_as_expired(self):
        Subscription.objects.create(
            user=self.user, plan=self.gold, status=Subscription.Status.ACTIVE,
            expires_at=timezone.now() - timedelta(seconds=1),
        )

        self.assertTrue(self.portal_access()["plan_expired"])

    def test_deactivated_plan_still_grants_access_until_it_ends(self):
        make_subscription(self.user, self.gold, days_left=5)
        self.gold.is_active = False
        self.gold.save()

        self.assertTrue(self.portal_access()["can_access_portal"])

    def test_renewed_user_has_access_and_no_expiry_flag(self):
        make_subscription(self.user, self.gold, days_left=-40, status=Subscription.Status.EXPIRED)
        make_subscription(self.user, self.free, days_left=30)

        data = self.portal_access()

        self.assertTrue(data["can_access_portal"])
        self.assertFalse(data["plan_expired"])

    def test_unverified_user_must_verify_first(self):
        self.user.is_verified = False
        self.user.save()
        make_subscription(self.user, self.gold, days_left=-2)

        data = self.portal_access()

        self.assertEqual(data["next_step"], "verify_mobile")
        self.assertFalse(data["plan_expired"])

    def test_admin_and_photographer_never_get_expiry_info(self):
        for role in ("ADMIN", "PHOTOGRAPHER"):
            self.user.role = role
            self.user.save()

            data = self.portal_access()

            self.assertFalse(data["plan_expired"])
            self.assertIsNone(data["expired_subscription"])

    def test_old_events_are_still_there_after_renewing(self):
        from datetime import date, time

        from events.models import Event

        make_subscription(self.user, self.gold, days_left=-1)
        Event.objects.create(
            organizer=self.user, name="Old wedding", event_type="WEDDING",
            event_date=date(2026, 8, 1), event_time=time(18, 0),
        )

        # Renew with the free plan through the real endpoint.
        response = self.client.post(reverse("subscribe"), {"plan_slug": "free"}, format="json")
        self.assertEqual(response.status_code, 201)

        self.assertTrue(self.portal_access()["can_access_portal"])
        listed = self.client.get("/api/events/").json()
        names = [event["name"] for event in listed.get("results", listed.get("data", []))]
        self.assertIn("Old wedding", names)


class TopupCarryOverTests(SubscriptionTestBase):
    """Unused topups survive upgrades, switches AND renewals after expiry,
    and are never credited twice."""

    def expired_gold(self, *, used, topup, voice_used=0, voice_topup=0, days_ago=3):
        return make_subscription(
            self.user, self.gold, days_left=-days_ago,
            invitations_used=used, invitations_topup=topup,
            voice_calls_used=voice_used, voice_calls_topup=voice_topup,
        )

    def renew_free(self):
        from .services import subscribe_user_to_plan

        return subscribe_user_to_plan(self.user, "free")

    def test_unused_topup_carries_over_on_free_renewal(self):
        # Gold allows 100; +50 topup; 120 used -> 30 left, all of it topup.
        self.expired_gold(used=120, topup=50, voice_used=12, voice_topup=5)

        new = self.renew_free()

        self.assertEqual(new.invitations_topup, 30)
        self.assertEqual(new.voice_calls_topup, 3)
        self.assertEqual(new.invitations_used, 0)
        self.assertEqual(new.voice_calls_used, 0)

    def test_untouched_topup_carries_over_in_full(self):
        self.expired_gold(used=40, topup=50)

        self.assertEqual(self.renew_free().invitations_topup, 50)

    def test_fully_spent_topup_carries_nothing(self):
        self.expired_gold(used=150, topup=50)

        self.assertEqual(self.renew_free().invitations_topup, 0)

    def test_paid_renewal_after_expiry_carries_over(self):
        from .services import activate_plan_for_user

        self.expired_gold(used=100, topup=20)

        new = activate_plan_for_user(self.user, self.gold)

        self.assertEqual(new.invitations_topup, 20)
        self.assertEqual(new.status, Subscription.Status.ACTIVE)

    def test_paid_renewal_through_cashfree_settlement_carries_over(self):
        from payments.models import Payment
        from payments.services import settle_order

        self.expired_gold(used=100, topup=20)
        Payment.objects.create(
            user=self.user, plan=self.gold, stripe_checkout_session_id="PLAN_renew1",
            amount=Decimal("999.00"), status=Payment.Status.CREATED,
        )

        # A sandbox-shaped "Get Order" reply; no network call is made.
        order = {"order_id": "PLAN_renew1", "order_status": "PAID",
                 "order_amount": 999.0, "order_currency": "INR"}
        settle_order(order, "cf_1")
        settle_order(order, "cf_1")  # webhook + status poll both arriving

        active = Subscription.objects.get(user=self.user, status=Subscription.Status.ACTIVE)
        self.assertEqual(active.invitations_topup, 20)
        self.assertEqual(Subscription.objects.filter(user=self.user).count(), 2)

    def test_upgrade_from_active_plan_still_carries_over(self):
        from .services import activate_plan_for_user

        make_subscription(self.user, self.free, days_left=10, invitations_used=60, invitations_topup=25)

        new = activate_plan_for_user(self.user, self.gold)

        # Free allows 50 +25 topup, 60 used -> 15 left, all topup.
        self.assertEqual(new.invitations_topup, 15)

    def test_only_the_latest_expired_plan_is_used_never_older_ones(self):
        # A expired long ago with a 50 topup, B (renewal) carried those 50
        # and expired too, with 20 of them used. Renewing now carries B's
        # leftover (30), not A's 50 on top.
        make_subscription(self.user, self.gold, days_left=-70, status=Subscription.Status.EXPIRED,
                          invitations_used=100, invitations_topup=50)
        make_subscription(self.user, self.gold, days_left=-5,
                          invitations_used=120, invitations_topup=50)

        self.assertEqual(self.renew_free().invitations_topup, 30)

    def test_renewing_twice_never_double_credits(self):
        from .services import SubscriptionError, activate_plan_for_user

        self.expired_gold(used=0, topup=40)

        first = self.renew_free()
        self.assertEqual(first.invitations_topup, 40)

        with self.assertRaises(SubscriptionError):
            self.renew_free()  # already active

        # Upgrading right after moves the same 40 across, not 80.
        second = activate_plan_for_user(self.user, self.gold)
        self.assertEqual(second.invitations_topup, 40)
        self.assertEqual(
            Subscription.objects.filter(user=self.user, status=Subscription.Status.ACTIVE).count(), 1
        )

    def test_unlimited_old_plan_carries_the_whole_topup(self):
        unlimited = MembershipPlan.objects.create(
            name="Max", slug="max", price=Decimal("4999.00"),
            total_invitations=None, voice_call_limit=None,
        )
        make_subscription(self.user, unlimited, days_left=-1, invitations_used=900,
                          invitations_topup=40, voice_calls_topup=7)

        new = self.renew_free()

        self.assertEqual(new.invitations_topup, 40)
        self.assertEqual(new.voice_calls_topup, 7)

    def test_first_ever_plan_starts_with_no_topup(self):
        new = self.renew_free()

        self.assertEqual(new.invitations_topup, 0)
        self.assertEqual(new.voice_calls_topup, 0)

    def test_cancelled_latest_row_is_not_treated_as_expired(self):
        make_subscription(self.user, self.gold, days_left=-3, status=Subscription.Status.CANCELLED,
                          invitations_topup=40)

        self.assertEqual(self.renew_free().invitations_topup, 0)
        self.assertFalse(self.portal_access()["plan_expired"])


class DiagnosePortalAccessCommandTests(SubscriptionTestBase):
    def run_command(self, *args):
        from io import StringIO

        from django.core.management import call_command

        out = StringIO()
        call_command("diagnose_portal_access", *args, stdout=out)
        return out.getvalue()

    def test_reports_expiry_without_changing_anything_or_leaking_personal_data(self):
        sub = make_subscription(self.user, self.gold, days_left=-2)

        output = self.run_command("--mobile", "9000000101")

        self.assertIn("EXPIRED on", output)
        self.assertIn("plan=gold", output)
        # Read-only: the overdue row is NOT tidied by the command.
        sub.refresh_from_db()
        self.assertEqual(sub.status, Subscription.Status.ACTIVE)
        # No personal data.
        for private in ("9000000101", "Test Organizer", "@example.com"):
            self.assertNotIn(private, output)

    def test_reports_access_for_an_active_plan(self):
        make_subscription(self.user, self.gold, days_left=5)

        self.assertIn("ACCESS", self.run_command("--user-id", str(self.user.pk)))

    def test_reports_never_subscribed(self):
        self.assertIn("never had a subscription", self.run_command("--user-id", str(self.user.pk)))

    def test_unknown_user_is_an_error(self):
        from django.core.management.base import CommandError

        with self.assertRaises(CommandError):
            self.run_command("--user-id", "999999")
