from django.db.models import Count, Q, Sum
from django.utils import timezone
from guests.models import Guest
from invitations.models import InvitationSend
from notifications.models import NotificationLog

# An event "needs attention" once this share of the guests it has already
# invited still have not answered.
ATTENTION_PENDING_RATE = 0.4


class DashboardError(Exception):
    """Raised when dashboard data cannot be computed."""

    def __init__(self, message: str, code: str = "dashboard_error"):
        self.message = message
        self.code = code
        super().__init__(message)


def _guest_counts(guests) -> dict:
    """Every guest figure the dashboards need, from ONE database query."""

    Status = Guest.ResponseStatus
    Invite = Guest.InvitationStatus

    return guests.aggregate(
        total=Count("id"),
        accepted=Count("id", filter=Q(response_status=Status.ACCEPTED)),
        rejected=Count("id", filter=Q(response_status=Status.REJECTED)),
        maybe=Count("id", filter=Q(response_status=Status.MAYBE)),
        pending=Count("id", filter=Q(response_status=Status.PENDING)),
        sent=Count("id", filter=Q(invitation_status=Invite.SENT)),
        not_sent=Count("id", filter=Q(invitation_status=Invite.NOT_SENT)),
        failed=Count("id", filter=Q(invitation_status=Invite.FAILED)),
        expected=Sum("family_member_count", filter=Q(response_status=Status.ACCEPTED)),
    )


def get_event_dashboard_stats(event) -> dict:
    """Compute all dashboard statistics for a single event.

    Expected attendance is calculated as:
        SUM(family_member_count) for guests with response_status = ACCEPTED
    """

    counts = _guest_counts(Guest.objects.filter(event=event))

    total_guests = counts["total"] or 0
    answered = total_guests - (counts["pending"] or 0)

    # Only messages that were really delivered to the provider count as
    # "sent" - failed attempts are reported separately as invitations_failed.
    sent_by_channel = dict(
        NotificationLog.objects.filter(
            invitation__event=event,
            status=NotificationLog.Status.SENT,
        )
        .values_list("channel")
        .annotate(count=Count("id"))
    )

    return {
        "total_guests": total_guests,
        "accepted_count": counts["accepted"] or 0,
        "rejected_count": counts["rejected"] or 0,
        "maybe_count": counts["maybe"] or 0,
        "pending_count": counts["pending"] or 0,
        "response_rate": round(answered / total_guests, 2) if total_guests else 0.0,
        "invitations_sent": counts["sent"] or 0,
        "invitations_not_sent": counts["not_sent"] or 0,
        "invitations_failed": counts["failed"] or 0,
        "notifications_sent": sum(sent_by_channel.values()),
        "whatsapp_sent_count": sent_by_channel.get("WHATSAPP", 0),
        "email_sent_count": sent_by_channel.get("EMAIL", 0),
        "sms_sent_count": sent_by_channel.get("SMS", 0),
        "voice_call_sent_count": sent_by_channel.get("VOICE_CALL", 0),
        "expected_attendance": counts["expected"] or 0,
    }


def get_event_response_chart_data(event) -> list:
    """Return guest response counts formatted for a pie/bar chart (Recharts-friendly)."""

    response_counts = dict(
        Guest.objects.filter(event=event)
        .values_list("response_status")
        .annotate(count=Count("id"))
    )

    labels = {
        Guest.ResponseStatus.ACCEPTED: "Accepted",
        Guest.ResponseStatus.REJECTED: "Declined",
        Guest.ResponseStatus.MAYBE: "Maybe",
        Guest.ResponseStatus.PENDING: "Pending",
    }

    return [
        {"name": label, "value": response_counts.get(status_value, 0)}
        for status_value, label in labels.items()
    ]


def get_event_invitation_chart_data(event) -> list:
    """Return invitation send-status counts formatted for a chart."""

    invitation_counts = dict(
        Guest.objects.filter(event=event)
        .values_list("invitation_status")
        .annotate(count=Count("id"))
    )

    labels = {
        Guest.InvitationStatus.SENT: "Sent",
        Guest.InvitationStatus.NOT_SENT: "Not Sent",
        Guest.InvitationStatus.FAILED: "Failed",
    }

    return [
        {"name": label, "value": invitation_counts.get(status_value, 0)}
        for status_value, label in labels.items()
    ]


def get_organizer_overview_stats(organizer) -> dict:
    """Compute a high-level summary across ALL of the organizer's events."""

    from events.models import Event

    counts = _guest_counts(Guest.objects.filter(event__organizer=organizer))

    return {
        "total_events": Event.objects.filter(organizer=organizer).count(),
        "total_guests": counts["total"] or 0,
        "total_accepted": counts["accepted"] or 0,
        "total_expected_attendance": counts["expected"] or 0,
    }


# ---------------------------------------------------------------------
# Invitation-focused dashboard
# ---------------------------------------------------------------------

def _empty_channel_totals() -> dict:
    return {
        channel: {"sent": 0, "failed": 0}
        for channel in InvitationSend.Channel.values
    }


def get_organizer_channel_performance(organizer) -> dict:
    """Per-channel send/failure totals across ALL of the organizer's
    events - the data behind the dashboard's channel performance chart.
    Reminders are counted too (every message that went out)."""

    totals = _empty_channel_totals()

    rows = (
        InvitationSend.objects.filter(event__organizer=organizer)
        .values("channel", "status")
        .annotate(count=Count("id"))
    )

    for row in rows:
        channel = row["channel"]
        if channel not in totals:
            continue

        if row["status"] == InvitationSend.Status.SENT:
            totals[channel]["sent"] += row["count"]
        elif row["status"] == InvitationSend.Status.FAILED:
            totals[channel]["failed"] += row["count"]

    return totals


def get_events_needing_attention(organizer, limit: int = 5) -> list[dict]:
    """A prioritized list of the organizer's coming-up events that need a look.

    An event qualifies when it is still live (not cancelled / completed,
    date not past) and either
      (a) 40% or more of the guests it has ALREADY INVITED have not
          answered, or
      (b) at least one PendingWhatsAppReminder is waiting on the organizer.
    Guests who were never sent an invitation are not "pending" - they just
    have not been invited yet - so they are left out of the rate.

    In each row ``total_guests`` and ``pending_count`` therefore refer to
    the invited guests. Most urgent first: highest pending rate, then most
    waiting reminders, then the soonest event.

    Runs a fixed three queries however many events the organizer has.
    """

    from events.models import Event
    from events.services import today
    from invitations.models import PendingWhatsAppReminder

    live_events = {
        event.id: event
        for event in Event.objects.filter(
            organizer=organizer,
            event_date__gte=today(),
        )
        .exclude(status__in=[Event.Status.CANCELLED, Event.Status.COMPLETED])
        .only("id", "name", "event_date")
    }

    if not live_events:
        return []

    invited_rows = (
        Guest.objects.filter(
            event_id__in=live_events.keys(),
            invitation_status=Guest.InvitationStatus.SENT,
        )
        .values("event_id")
        .annotate(
            invited=Count("id"),
            pending=Count("id", filter=Q(response_status=Guest.ResponseStatus.PENDING)),
        )
    )

    reminder_counts = dict(
        PendingWhatsAppReminder.objects.filter(event_id__in=live_events.keys())
        .values_list("event_id")
        .annotate(count=Count("id"))
    )

    results = []

    for row in invited_rows:
        invited = row["invited"]
        pending = row["pending"]
        event = live_events[row["event_id"]]

        pending_rate = pending / invited if invited else 0
        reminder_count = reminder_counts.get(event.id, 0)

        if pending_rate < ATTENTION_PENDING_RATE and reminder_count == 0:
            continue

        results.append(
            {
                "event_id": event.id,
                "event_name": event.name,
                "event_date": event.event_date,
                "total_guests": invited,
                "pending_count": pending,
                "pending_rate": round(pending_rate, 2),
                "pending_whatsapp_reminders": reminder_count,
            }
        )

    # Events with reminders waiting but no invited guests yet cannot appear
    # (they have no invited rows); reminders always belong to invited guests.
    results.sort(
        key=lambda row: (
            -row["pending_rate"],
            -row["pending_whatsapp_reminders"],
            row["event_date"],
        )
    )

    return results[:limit]


def get_organizer_quota_usage(organizer) -> dict | None:
    """Return the organizer's current subscription quota usage, or None
    if they have no active subscription.

    Totals include any top-up allowance bought on top of the plan, so
    used / total / remaining always agree with each other.
    """

    from memberships.services import get_active_subscription

    subscription = get_active_subscription(organizer)

    if subscription is None:
        return None

    plan = subscription.plan

    invitations_total = (
        None
        if plan.total_invitations is None
        else plan.total_invitations + subscription.invitations_topup
    )
    voice_calls_total = (
        None
        if plan.voice_call_limit is None
        else plan.voice_call_limit + subscription.voice_calls_topup
    )

    return {
        "plan_name": plan.name,
        "invitations_used": subscription.invitations_used,
        "invitations_total": invitations_total,
        "invitations_remaining": subscription.invitations_remaining(),
        "voice_calls_used": subscription.voice_calls_used,
        "voice_calls_total": voice_calls_total,
        "voice_calls_remaining": subscription.voice_calls_remaining(),
        "expires_at": subscription.expires_at,
    }


def get_organizer_invitation_overview(organizer) -> dict:
    """Assemble the full dashboard payload: the cross-event overview stats,
    plus channel performance, events needing attention, and quota usage -
    all in one call so the dashboard page makes a single request."""

    from invitations.models import PendingWhatsAppReminder

    return {
        **get_organizer_overview_stats(organizer),
        "pending_whatsapp_reminders": PendingWhatsAppReminder.objects.filter(
            event__organizer=organizer
        ).count(),
        "channel_performance": get_organizer_channel_performance(organizer),
        "events_needing_attention": get_events_needing_attention(organizer),
        "quota_usage": get_organizer_quota_usage(organizer),
        "generated_at": timezone.now(),
    }
