"""End-of-process invitation report.

Pulls together InvitationSend / Guest data into one report structure
covering: send totals by channel (first sends vs reminders), RSVP totals
(by guest count and by headcount via family_member_count), the same two
broken down per GuestCategory, and a full per-guest detail log.
Read-only - this module only aggregates existing data.

The whole report costs a fixed handful of queries, however many categories
or guests the event has.
"""

from django.db.models import Count, Sum

from guests.models import Guest, GuestCategory
from invitations.models import InvitationSend


def _empty_channel_totals() -> dict:
    return {
        channel: {"sent": 0, "failed": 0, "reminders_sent": 0}
        for channel in InvitationSend.Channel.values
    }


def _add_send_row(totals: dict, row: dict) -> None:
    """Fold one grouped InvitationSend row into a channel-totals dict."""

    channel = row["channel"]

    if channel not in totals:
        return

    if row["is_reminder"]:
        if row["status"] == InvitationSend.Status.SENT:
            totals[channel]["reminders_sent"] += row["count"]
    elif row["status"] == InvitationSend.Status.SENT:
        totals[channel]["sent"] += row["count"]
    elif row["status"] == InvitationSend.Status.FAILED:
        totals[channel]["failed"] += row["count"]


def _empty_rsvp_totals() -> dict:
    return {
        status: {"guests": 0, "headcount": 0} for status in Guest.ResponseStatus.values
    }


def _add_rsvp_row(totals: dict, response_status: str, guests: int, headcount) -> None:
    if response_status not in totals:
        return

    totals[response_status]["guests"] += guests
    totals[response_status]["headcount"] += headcount or 0


def build_send_summary(event) -> dict:
    """Per-channel totals: first sends (sent/failed) and reminders sent,
    for this event as a whole."""

    totals = _empty_channel_totals()

    rows = (
        InvitationSend.objects.filter(event=event)
        .values("channel", "is_reminder", "status")
        .annotate(count=Count("id"))
    )

    for row in rows:
        _add_send_row(totals, row)

    return totals


def build_rsvp_summary(guests_queryset) -> dict:
    """RSVP totals for a given guest queryset: guest counts AND headcount
    (sum of family_member_count) per response status."""

    totals = _empty_rsvp_totals()

    rows = guests_queryset.values("response_status").annotate(
        guest_count=Count("id"), headcount=Sum("family_member_count")
    )

    for row in rows:
        _add_rsvp_row(totals, row["response_status"], row["guest_count"], row["headcount"])

    return totals


def build_category_breakdown(event) -> list[dict]:
    """Per-category breakdown of both send totals and RSVP totals,
    including an "Uncategorized" bucket for guests with no category."""

    categories = list(
        GuestCategory.objects.filter(event=event).order_by("display_order", "name")
    )

    send_totals: dict = {}
    for row in (
        InvitationSend.objects.filter(event=event)
        .values("guest__category_id", "channel", "is_reminder", "status")
        .annotate(count=Count("id"))
    ):
        bucket = send_totals.setdefault(row["guest__category_id"], _empty_channel_totals())
        _add_send_row(bucket, row)

    rsvp_totals: dict = {}
    for row in (
        Guest.objects.filter(event=event)
        .values("category_id", "response_status")
        .annotate(guest_count=Count("id"), headcount=Sum("family_member_count"))
    ):
        bucket = rsvp_totals.setdefault(row["category_id"], _empty_rsvp_totals())
        _add_rsvp_row(bucket, row["response_status"], row["guest_count"], row["headcount"])

    breakdown = [
        {
            "category_id": category.id,
            "category_name": category.name,
            "send_summary": send_totals.get(category.id, _empty_channel_totals()),
            "rsvp_summary": rsvp_totals.get(category.id, _empty_rsvp_totals()),
        }
        for category in categories
    ]

    # Guests without a category (only listed when there are any).
    if None in rsvp_totals:
        breakdown.append(
            {
                "category_id": None,
                "category_name": "Uncategorized",
                "send_summary": send_totals.get(None, _empty_channel_totals()),
                "rsvp_summary": rsvp_totals[None],
            }
        )

    return breakdown


def build_guest_detail_rows(event) -> list[dict]:
    """One row per guest: invitation status, response status, channel(s)
    used, and total reminders sent (manual + automatic combined)."""

    guests = (
        Guest.objects.filter(event=event)
        .select_related("category")
        .order_by("name", "id")
    )

    reminder_counts = dict(
        InvitationSend.objects.filter(
            event=event, is_reminder=True, status=InvitationSend.Status.SENT
        )
        .values_list("guest_id")
        .annotate(count=Count("id"))
    )

    # A guest may have sends across more than one channel (e.g. retried on
    # a different channel) - collect the distinct set actually used.
    channels_used: dict = {}
    for guest_id, channel in (
        InvitationSend.objects.filter(event=event, status=InvitationSend.Status.SENT)
        .values_list("guest_id", "channel")
        .distinct()
        .order_by("guest_id", "channel")
    ):
        channels_used.setdefault(guest_id, []).append(channel)

    return [
        {
            "guest_id": guest.id,
            "guest_name": guest.name,
            "category_name": guest.category.name if guest.category else None,
            "family_member_count": guest.family_member_count,
            "invitation_status": guest.invitation_status,
            "response_status": guest.response_status,
            "channels_used": channels_used.get(guest.id, []),
            "reminders_sent": reminder_counts.get(guest.id, 0),
        }
        for guest in guests
    ]


def build_full_report(event) -> dict:
    """Assemble the complete report for one event."""

    all_guests_qs = Guest.objects.filter(event=event)

    return {
        "event_id": event.id,
        "event_name": event.name,
        "total_guests": all_guests_qs.count(),
        "total_expected_headcount": all_guests_qs.aggregate(
            total=Sum("family_member_count")
        )["total"]
        or 0,
        "send_summary": build_send_summary(event),
        "rsvp_summary": build_rsvp_summary(all_guests_qs),
        "category_breakdown": build_category_breakdown(event),
        "guest_details": build_guest_detail_rows(event),
    }