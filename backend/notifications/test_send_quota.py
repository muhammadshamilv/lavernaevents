"""Send quota is reserved before the provider call and refunded on failure.

Every provider handler is replaced with a mock: no SMS, email or call is
made. Run:  python manage.py test notifications --settings=config.test_settings
"""

from datetime import date, time, timedelta
from decimal import Decimal
from types import SimpleNamespace
from unittest import mock

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone

from events.models import Event
from guests.models import Guest
from invitations.models import InvitationSend
from invitations.services import InvitationError
from memberships.models import MembershipPlan, Subscription
from memberships.services import QuotaReservation, release_send_quota
from memberships.topup_models import PlatformChannelPool

from . import services
from .models import NotificationLog
from .services import NotificationError, send_active_template_to_guest


class SendQuotaTests(TestCase):
    def setUp(self):
        self.organizer = get_user_model().objects.create_user(
            mobile_number="9000000401", password="Strong@Pass91", full_name="Org", email="o401@example.com",
        )
        self.organizer.role = "ORGANIZER"
        self.organizer.is_verified = True
        self.organizer.save()

        self.plan = MembershipPlan.objects.create(
            name="Silver", slug="silver", price=Decimal("499.00"),
            total_invitations=1, voice_call_limit=1,
        )
        self.subscription = Subscription.objects.create(
            user=self.organizer, plan=self.plan, status=Subscription.Status.ACTIVE,
            expires_at=timezone.now() + timedelta(days=10),
        )
        self.event = Event.objects.create(
            organizer=self.organizer, name="Party", event_type="BIRTHDAY",
            event_date=date(2026, 12, 24), event_time=time(18, 0), status="PUBLISHED",
        )
        self.guest = Guest.objects.create(event=self.event, name="Guest A", mobile_number="919000000501")
        self.guest_b = Guest.objects.create(event=self.event, name="Guest B", mobile_number="919000000502")

        # Template plumbing is not under test here.
        for target, value in (
            ("ensure_sendable_active_template", SimpleNamespace(template=None)),
            ("_get_or_create_invitation_for_active", SimpleNamespace(pk=1)),
            ("_build_message_for_channel", "Hello"),
        ):
            patcher = mock.patch.object(services, target, return_value=value)
            patcher.start()
            self.addCleanup(patcher.stop)

    def handler(self, side_effect):
        """Replace the SMS + voice provider handlers for one test."""

        fake = mock.Mock(side_effect=side_effect)
        return mock.patch.dict(services.CHANNEL_HANDLERS, {"SMS": fake, "VOICE_CALL": fake}), fake

    @staticmethod
    def sent_log(*args, **kwargs):
        return SimpleNamespace(status=NotificationLog.Status.SENT)

    def send(self, guest=None, channel="SMS"):
        return send_active_template_to_guest(self.event, guest or self.guest, self.organizer, channel=channel)

    def used(self):
        self.subscription.refresh_from_db()
        return self.subscription.invitations_used, self.subscription.voice_calls_used

    # ------------------------------------------------------------------

    def test_successful_send_spends_one_unit_and_the_pool(self):
        pool = PlatformChannelPool.objects.create(channel="SMS", total_capacity=10, used=0)
        patch, _ = self.handler(self.sent_log)

        with patch:
            self.send()

        self.assertEqual(self.used(), (1, 0))
        pool.refresh_from_db()
        self.assertEqual(pool.used, 1)

    def test_quota_is_taken_before_the_provider_is_called(self):
        seen = {}

        def provider(*args, **kwargs):
            seen["used_during_call"] = self.used()[0]
            return self.sent_log()

        patch, _ = self.handler(provider)
        with patch:
            self.send()

        self.assertEqual(seen["used_during_call"], 1)

    def test_a_second_send_during_the_first_provider_call_is_refused(self):
        # The plan has 1 invitation. While the first send is still talking
        # to the provider, a second one (another tab / bulk batch) arrives.
        second = {}

        def provider(invitation, *args, **kwargs):
            if "error" not in second:
                try:
                    self.send(guest=self.guest_b)
                    second["error"] = None
                except InvitationError as error:
                    second["error"] = error.code
            return self.sent_log()

        patch, fake = self.handler(provider)
        with patch:
            self.send()

        self.assertEqual(second["error"], "invitation_limit_exceeded")
        self.assertEqual(fake.call_count, 1)
        self.assertEqual(self.used(), (1, 0))

    def test_provider_failure_refunds_and_records_the_failure(self):
        pool = PlatformChannelPool.objects.create(channel="SMS", total_capacity=10, used=3)
        patch, _ = self.handler(NotificationError("SMS failed", code="sms_failed"))

        with patch, self.assertRaises(NotificationError):
            self.send()

        self.assertEqual(self.used(), (0, 0))
        pool.refresh_from_db()
        self.assertEqual(pool.used, 3)
        self.assertTrue(
            InvitationSend.objects.filter(guest=self.guest, status=InvitationSend.Status.FAILED).exists()
        )

    def test_unexpected_error_refunds_and_is_not_swallowed(self):
        patch, _ = self.handler(RuntimeError("boom"))

        with patch, self.assertRaises(RuntimeError):
            self.send()

        self.assertEqual(self.used(), (0, 0))

    def test_failed_send_frees_quota_for_the_next_guest(self):
        patch, _ = self.handler([NotificationError("SMS failed", code="sms_failed"), self.sent_log()])

        with patch:
            with self.assertRaises(NotificationError):
                self.send()
            self.send(guest=self.guest_b)  # the refunded unit is usable

        self.assertEqual(self.used(), (1, 0))

    def test_limit_reached_never_calls_the_provider(self):
        Subscription.objects.filter(pk=self.subscription.pk).update(invitations_used=1)
        patch, fake = self.handler(self.sent_log)

        with patch, self.assertRaises(InvitationError) as raised:
            self.send()

        self.assertEqual(raised.exception.code, "invitation_limit_exceeded")
        fake.assert_not_called()
        self.assertEqual(self.used(), (1, 0))

    def test_topup_extends_the_limit(self):
        Subscription.objects.filter(pk=self.subscription.pk).update(invitations_used=1, invitations_topup=1)
        patch, _ = self.handler(self.sent_log)

        with patch:
            self.send()

        self.assertEqual(self.used(), (2, 0))

    def test_empty_platform_pool_refuses_without_charging_the_organizer(self):
        PlatformChannelPool.objects.create(channel="SMS", total_capacity=5, used=5)
        patch, fake = self.handler(self.sent_log)

        with patch, self.assertRaises(InvitationError) as raised:
            self.send()

        self.assertEqual(raised.exception.code, "platform_pool_exhausted")
        fake.assert_not_called()
        self.assertEqual(self.used(), (0, 0))

    def test_voice_call_uses_its_own_pool(self):
        patch, _ = self.handler(lambda *a, **k: SimpleNamespace(status=NotificationLog.Status.CALLING))

        with patch:
            self.send(channel="VOICE_CALL")
            with self.assertRaises(InvitationError) as raised:
                self.send(guest=self.guest_b, channel="VOICE_CALL")

        self.assertEqual(raised.exception.code, "voice_call_limit_exceeded")
        self.assertEqual(self.used(), (0, 1))

    def test_voice_not_on_plan(self):
        self.plan.voice_call_limit = 0
        self.plan.save()
        patch, fake = self.handler(self.sent_log)

        with patch, self.assertRaises(InvitationError) as raised:
            self.send(channel="VOICE_CALL")

        self.assertEqual(raised.exception.code, "voice_call_not_available")
        fake.assert_not_called()

    def test_unlimited_plan_still_counts_usage(self):
        self.plan.total_invitations = None
        self.plan.save()
        Subscription.objects.filter(pk=self.subscription.pk).update(invitations_used=500)
        patch, _ = self.handler(self.sent_log)

        with patch:
            self.send()

        self.assertEqual(self.used(), (501, 0))

    def test_expired_plan_cannot_send(self):
        Subscription.objects.filter(pk=self.subscription.pk).update(expires_at=timezone.now() - timedelta(minutes=1))
        patch, fake = self.handler(self.sent_log)

        with patch, self.assertRaises(InvitationError) as raised:
            self.send()

        self.assertEqual(raised.exception.code, "no_active_plan")
        fake.assert_not_called()

    def test_release_never_goes_below_zero(self):
        release_send_quota(QuotaReservation(self.subscription.pk, "invitations_used", None, 5))

        self.assertEqual(self.used(), (0, 0))
