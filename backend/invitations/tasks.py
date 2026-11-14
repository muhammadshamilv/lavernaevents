import logging
from datetime import timedelta

from celery import shared_task
from django.db import transaction
from django.db.models import Q
from django.utils import timezone

logger = logging.getLogger(__name__)

# A reminder that fails this many times (for the same original invitation)
# is given up on, so a wrong number or a provider outage can't trigger a
# paid provider call every 10 minutes forever. Each failure is stored as a
# FAILED reminder row, so the organizer's report shows what happened.
MAX_FAILED_REMINDER_ATTEMPTS = 3


def _reminder_blocked(guest, original_send) -> str | None:
    """Why this guest must NOT be reminded now, or None if they may be.

    Called once before taking the guest's row lock (cheap filter) and AGAIN
    after taking it, because another overlapping run may have reminded the
    guest in between.
    """

    from invitations.models import InvitationSend

    reminders = InvitationSend.objects.filter(
        event=original_send.event_id,
        guest=guest,
        is_reminder=True,
        created_at__gte=original_send.created_at,
    )

    if reminders.filter(status=InvitationSend.Status.SENT).exists():
        return "already_reminded"

    if reminders.filter(status=InvitationSend.Status.FAILED).count() >= MAX_FAILED_REMINDER_ATTEMPTS:
        return "gave_up"

    return None


def _failed_reminder_count(guest, original_send) -> int:
    from invitations.models import InvitationSend

    return InvitationSend.objects.filter(
        event=original_send.event_id,
        guest=guest,
        is_reminder=True,
        status=InvitationSend.Status.FAILED,
        created_at__gte=original_send.created_at,
    ).count()


def _record_failed_reminder(guest, original_send, organizer, reason: str) -> None:
    """Store a failed attempt that stopped BEFORE reaching a provider (no
    quota left, event closed, ...). Provider failures are already stored by
    notifications.services.send_active_template_to_guest."""

    from invitations.models import InvitationSend

    InvitationSend.objects.create(
        event=guest.event,
        guest=guest,
        template=original_send.template,
        channel=original_send.channel,
        status=InvitationSend.Status.FAILED,
        is_reminder=True,
        sent_by=organizer,
        failure_reason=(reason or "Reminder could not be sent.")[:255],
    )


@shared_task(name="invitations.send_due_reminders")
def send_due_reminders():
    """Find guests whose reminder has come due and act on it.

    Runs every N minutes via Celery Beat (see config/settings.py's
    CELERY_BEAT_SCHEDULE). For each guest who:
      - still has response_status == PENDING
      - has at least one successful (non-reminder) InvitationSend
      - has an applicable ReminderSchedule (individual or category-level)
      - is now past sent_at + delay_hours
      - has NOT already been SUCCESSFULLY reminded since that original send

    ...this either sends the reminder immediately (Email/SMS/Voice Call -
    channels the server can dispatch on its own) or queues a
    PendingWhatsAppReminder for the organizer to one-click-send (WhatsApp
    has no server-side auto-send path).

    The reminder goes out over the SAME channel the guest's invitation was
    originally sent on (the organizer now picks the channel at send time,
    so it can differ from the template's own channel).

    Each guest is processed independently and a failure on one guest
    (e.g. quota exhausted) does not stop the rest of the batch.
    """

    from guests.models import Guest
    from invitations.models import InvitationSend, PendingWhatsAppReminder
    from invitations.services import (
        InvitationError,
        get_active_filled_template,
        get_applicable_schedule,
    )
    from notifications.services import NotificationError, send_reminder_to_guest

    now = timezone.now()

    # Only guests that can possibly have a schedule (their own, or via their
    # category) on events that are still running - not every guest on the
    # platform on every tick.
    candidates = (
        Guest.objects.filter(
            Q(reminder_schedules__is_active=True)
            | Q(category__reminder_schedules__is_active=True),
            response_status=Guest.ResponseStatus.PENDING,
        )
        .exclude(event__status__in=["CANCELLED", "COMPLETED"])
        .select_related("event", "event__organizer", "category")
        .distinct()
    )

    sent_count = 0
    queued_count = 0
    skipped_count = 0

    for guest in candidates:
        schedule = get_applicable_schedule(guest)

        if schedule is None:
            continue

        original_send = (
            InvitationSend.objects.filter(
                event=guest.event,
                guest=guest,
                status=InvitationSend.Status.SENT,
                is_reminder=False,
            )
            .order_by("-sent_at", "-created_at")
            .first()
        )

        if original_send is None or original_send.sent_at is None:
            continue

        due_at = original_send.sent_at + timedelta(hours=schedule.delay_hours)

        if now < due_at:
            continue

        # Already reminded since the original send, or failed too often:
        # don't try again on every Beat tick. Fewer than
        # MAX_FAILED_REMINDER_ATTEMPTS failures are retried on the next tick.
        if _reminder_blocked(guest, original_send) is not None:
            continue

        already_queued = PendingWhatsAppReminder.objects.filter(guest=guest).exists()

        if already_queued:
            continue

        organizer = guest.event.organizer
        active = get_active_filled_template(organizer)

        if active is None or active.event_id != guest.event_id:
            # Nothing sensible to remind with right now - skip silently,
            # reconsidered on the next tick.
            skipped_count += 1
            continue

        if original_send.channel == "WHATSAPP":
            PendingWhatsAppReminder.objects.create(
                event=guest.event,
                guest=guest,
                schedule=schedule,
                due_at=due_at,
            )
            queued_count += 1
            continue

        # Lock the guest row for the send, so two overlapping runs can't
        # both remind the same guest. A row another run holds is skipped.
        # Everything is re-checked once the lock is held, because another
        # run may have sent (or the guest replied) since the check above.
        failed_attempt = False

        with transaction.atomic():
            locked = (
                Guest.objects.select_for_update(skip_locked=True)
                .select_related("event")
                .filter(pk=guest.pk)
                .first()
            )

            if (
                locked is None
                or locked.response_status != Guest.ResponseStatus.PENDING
                or _reminder_blocked(locked, original_send) is not None
            ):
                continue

            failures_before = _failed_reminder_count(locked, original_send)

            try:
                send_reminder_to_guest(
                    event=locked.event,
                    guest=locked,
                    organizer=organizer,
                    channel=original_send.channel,
                )
            except (InvitationError, NotificationError) as error:
                # Quota exhausted, template misconfigured, provider error...
                # Always leave exactly one FAILED row per attempt, so the
                # attempt counts towards MAX_FAILED_REMINDER_ATTEMPTS.
                if _failed_reminder_count(locked, original_send) == failures_before:
                    _record_failed_reminder(locked, original_send, organizer, error.message)

                failed_attempt = True
                logger.warning(
                    "Reminder for guest %s failed (%s): attempt %s of %s.",
                    locked.pk,
                    getattr(error, "code", "error"),
                    failures_before + 1,
                    MAX_FAILED_REMINDER_ATTEMPTS,
                )

        if failed_attempt:
            skipped_count += 1
        else:
            sent_count += 1

    return {"sent": sent_count, "queued_whatsapp": queued_count, "skipped": skipped_count}
