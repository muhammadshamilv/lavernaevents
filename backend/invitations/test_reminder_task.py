"""Tests for the Celery reminder task (invitations.tasks.send_due_reminders).

The provider send itself (notifications.services.send_reminder_to_guest) is
mocked: no SMS, email or call is ever made. Everything else (guests,
schedules, audit rows, the retry cap) is real database work.

Run:  python manage.py test invitations --settings=config.test_settings
"""

from datetime import date, time, timedelta
from types import SimpleNamespace
from unittest import mock

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone

from events.models import Event
from guests.models import Guest
from notifications.services import NotificationError

from . import tasks
from .models import InvitationSend, ReminderSchedule
from .services import InvitationError

SEND_PATH = "notifications.services.send_reminder_to_guest"
ACTIVE_PATH = "invitations.services.get_active_filled_template"


class ReminderTaskTests(TestCase):
    def setUp(self):
        self.organizer = get_user_model().objects.create_user(
            mobile_number="9000000201", password="Strong@Pass91", full_name="Org", email="o201@example.com",
        )
        self.organizer.role = "ORGANIZER"
        self.organizer.is_verified = True
        self.organizer.save()

        self.event = Event.objects.create(
            organizer=self.organizer, name="Reception", event_type="WEDDING",
            event_date=date(2026, 12, 20), event_time=time(19, 0), status="PUBLISHED",
        )
        self.guest = Guest.objects.create(event=self.event, name="Guest A", mobile_number="919000000301")
        ReminderSchedule.objects.create(event=self.event, guest=self.guest, delay_hours=24)

        self.original = self.make_original_send()

        # The organizer's active template is for this event.
        patcher = mock.patch(ACTIVE_PATH, return_value=SimpleNamespace(event_id=self.event.id))
        patcher.start()
        self.addCleanup(patcher.stop)

    def make_original_send(self, hours_ago=48):
        return InvitationSend.objects.create(
            event=self.event, guest=self.guest, channel="SMS",
            status=InvitationSend.Status.SENT, is_reminder=False, sent_by=self.organizer,
            sent_at=timezone.now() - timedelta(hours=hours_ago),
        )

    def reminder_rows(self, status):
        return InvitationSend.objects.filter(guest=self.guest, is_reminder=True, status=status)

    def provider_failure(self, *args, **kwargs):
        """Like a real provider failure: the send path stores its own FAILED row, then raises."""

        InvitationSend.objects.create(
            event=self.event, guest=self.guest, channel="SMS", status=InvitationSend.Status.FAILED,
            is_reminder=True, sent_by=self.organizer, failure_reason="Fast2SMS rejected the number",
        )
        raise NotificationError("SMS failed: invalid number", code="sms_failed")

    def provider_success(self, *args, **kwargs):
        InvitationSend.objects.create(
            event=self.event, guest=self.guest, channel="SMS", status=InvitationSend.Status.SENT,
            is_reminder=True, sent_by=self.organizer, sent_at=timezone.now(),
        )
        return SimpleNamespace(status="SENT")

    # ------------------------------------------------------------------

    def test_successful_reminder_is_sent_once(self):
        with mock.patch(SEND_PATH, side_effect=self.provider_success) as send:
            first = tasks.send_due_reminders()
            second = tasks.send_due_reminders()

        self.assertEqual(send.call_count, 1)
        self.assertEqual(first["sent"], 1)
        self.assertEqual(second["sent"], 0)

    def test_provider_failure_retried_at_most_three_times_and_recorded_once_each(self):
        with mock.patch(SEND_PATH, side_effect=self.provider_failure) as send:
            for _ in range(6):
                tasks.send_due_reminders()

        self.assertEqual(send.call_count, tasks.MAX_FAILED_REMINDER_ATTEMPTS)
        # One FAILED row per attempt - the task does not add a duplicate.
        self.assertEqual(self.reminder_rows(InvitationSend.Status.FAILED).count(), 3)
        self.assertEqual(
            self.reminder_rows(InvitationSend.Status.FAILED).first().failure_reason,
            "Fast2SMS rejected the number",
        )

    def test_failure_before_the_provider_is_recorded_and_capped(self):
        no_quota = InvitationError("Invitation limit reached.", code="invitation_limit_exceeded")

        with mock.patch(SEND_PATH, side_effect=no_quota) as send:
            for _ in range(5):
                tasks.send_due_reminders()

        self.assertEqual(send.call_count, 3)
        failed = self.reminder_rows(InvitationSend.Status.FAILED)
        self.assertEqual(failed.count(), 3)
        self.assertEqual(failed.first().failure_reason, "Invitation limit reached.")
        self.assertEqual(failed.first().channel, "SMS")

    def test_two_failures_then_success_sends_once(self):
        outcomes = iter([self.provider_failure, self.provider_failure, self.provider_success])

        with mock.patch(SEND_PATH, side_effect=lambda *a, **k: next(outcomes)(*a, **k)) as send:
            for _ in range(5):
                tasks.send_due_reminders()

        self.assertEqual(send.call_count, 3)
        self.assertEqual(self.reminder_rows(InvitationSend.Status.SENT).count(), 1)

    def test_a_new_invitation_resets_the_failure_cap(self):
        with mock.patch(SEND_PATH, side_effect=self.provider_failure):
            for _ in range(3):
                tasks.send_due_reminders()

        # The organizer sends the invitation again later; its reminder may
        # be tried again.
        newer = self.make_original_send(hours_ago=30)
        InvitationSend.objects.filter(pk=newer.pk).update(created_at=timezone.now())

        with mock.patch(SEND_PATH, side_effect=self.provider_success) as send:
            tasks.send_due_reminders()

        self.assertEqual(send.call_count, 1)

    def test_rechecks_after_the_lock_when_another_run_already_reminded(self):
        real_check = tasks._reminder_blocked
        calls = {"n": 0}

        def stale_then_real(guest, original_send):
            calls["n"] += 1
            if calls["n"] == 1:
                # Another overlapping run sends right after our first look.
                self.provider_success()
                return None
            return real_check(guest, original_send)

        with mock.patch.object(tasks, "_reminder_blocked", side_effect=stale_then_real), \
                mock.patch(SEND_PATH) as send:
            result = tasks.send_due_reminders()

        send.assert_not_called()
        self.assertEqual(result["sent"], 0)

    def test_rechecks_after_the_lock_when_the_guest_just_replied(self):
        real_check = tasks._reminder_blocked

        def guest_replies_first(guest, original_send):
            Guest.objects.filter(pk=self.guest.pk).update(response_status=Guest.ResponseStatus.ACCEPTED)
            return real_check(guest, original_send)

        with mock.patch.object(tasks, "_reminder_blocked", side_effect=guest_replies_first), \
                mock.patch(SEND_PATH) as send:
            tasks.send_due_reminders()

        send.assert_not_called()

    def test_not_due_yet_is_left_alone(self):
        InvitationSend.objects.filter(pk=self.original.pk).update(sent_at=timezone.now() - timedelta(hours=2))

        with mock.patch(SEND_PATH) as send:
            tasks.send_due_reminders()

        send.assert_not_called()
