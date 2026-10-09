from datetime import timedelta

from celery import shared_task
from django.db import transaction
from django.db.models import Q
from django.utils import timezone


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

        # Already (successfully) reminded since the original send - don't
        # remind again on every Beat tick. A FAILED reminder attempt does
        # not count, so it is retried on the next tick.
        already_reminded = InvitationSend.objects.filter(
            event=guest.event,
            guest=guest,
            is_reminder=True,
            status=InvitationSend.Status.SENT,
            created_at__gte=original_send.created_at,
        ).exists()

        if already_reminded:
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

        try:
            # Lock the guest row for the send, so two overlapping runs can't
            # both remind the same guest. A row another run holds is skipped.
            with transaction.atomic():
                locked = Guest.objects.select_for_update(skip_locked=True).filter(pk=guest.pk).first()

                if locked is None:
                    continue

                send_reminder_to_guest(
                    event=guest.event,
                    guest=locked,
                    organizer=organizer,
                    channel=original_send.channel,
                )
            sent_count += 1

        except (InvitationError, NotificationError):
            # Quota exhausted, template misconfigured, provider error, etc.
            skipped_count += 1

    return {"sent": sent_count, "queued_whatsapp": queued_count, "skipped": skipped_count}
