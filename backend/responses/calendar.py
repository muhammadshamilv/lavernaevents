"""Builds the "Add to Calendar" data for the guest invitation page:
an .ics file (Apple / Outlook / any calendar app) and a one-tap
Google Calendar link.

The .ics is hand-rolled rather than pulling in a library - the RFC 5545
subset needed here (one VEVENT, a few fields, correct line folding) is
small and stable.
"""

from datetime import datetime, timedelta

from django.conf import settings
from django.utils.html import strip_tags

# Used only when neither the event nor the organizer's filled template
# gives an end time.
EVENT_DURATION = timedelta(hours=2)


def resolve_schedule(invitation) -> dict:
    """Work out the start / end the guest should see for this invitation.

    The organizer's confirmed template values win (that is what the
    invitation card shows); otherwise the event's own start / end time is
    used; with no end time anywhere a 2 hour block is assumed. An end
    time that is not after the start is treated as the next day
    (an overnight event).
    """

    from invitations.models import ActiveFilledTemplate
    from invitations.services import format_time_range, parse_clock_input

    event = invitation.event

    start_time = event.event_time
    end_time = getattr(event, "event_end_time", None)
    accent_color = ""

    active = ActiveFilledTemplate.objects.filter(
        organizer=event.organizer,
        template=invitation.template,
        event=event,
    ).first()

    if active is not None:
        values = active.standard_values or {}

        picked_start = parse_clock_input(values.get("time_from"))

        if picked_start is not None:
            start_time = picked_start
            end_time = parse_clock_input(values.get("time_to"))

        accent_color = values.get("text_color", "") or ""

    start_dt = datetime.combine(event.event_date, start_time)

    if end_time is None:
        end_dt = start_dt + EVENT_DURATION
        has_end = False
    else:
        end_dt = datetime.combine(event.event_date, end_time)

        if end_dt <= start_dt:
            end_dt += timedelta(days=1)

        has_end = True

    return {
        "start_dt": start_dt,
        "end_dt": end_dt,
        "start_time": start_time,
        "end_time": end_time if has_end else None,
        "time_text": format_time_range(start_time, end_time if has_end else None),
        "accent_color": accent_color,
    }


def _escape_ics_text(value: str) -> str:
    """Escape text per RFC 5545 (section 3.3.11): backslash, semicolon,
    comma, and newlines need escaping inside TEXT values."""

    return (
        value.replace("\\", "\\\\")
        .replace(";", "\;")
        .replace(",", "\\,")
        .replace("\n", "\\n")
    )


def _fold_line(line: str) -> str:
    """Fold lines longer than 75 octets per RFC 5545 (section 3.1), since
    some calendar clients reject unfolded long lines."""

    if len(line) <= 75:
        return line

    folded = [line[:75]]
    rest = line[75:]

    while rest:
        folded.append(" " + rest[:74])
        rest = rest[74:]

    return "\r\n".join(folded)


def _description_text(event) -> str:
    lines = [f"You're invited to {event.name}."]

    if event.description:
        lines.append(strip_tags(event.description))

    return "\n".join(lines)


def _location_text(event) -> str:
    return ", ".join(part for part in (event.venue_name, event.address) if part)


def build_google_calendar_url(event, start_dt: datetime, end_dt: datetime) -> str:
    """A link that opens Google Calendar with the event already filled in -
    the guest only has to press Save."""

    from urllib.parse import urlencode

    details = _description_text(event)

    if event.google_maps_link:
        details += f"\n\nMap: {event.google_maps_link}"

    params = {
        "action": "TEMPLATE",
        "text": event.name,
        "dates": f"{start_dt.strftime('%Y%m%dT%H%M%S')}/{end_dt.strftime('%Y%m%dT%H%M%S')}",
        "details": details,
        "location": _location_text(event),
        "ctz": getattr(settings, "TIME_ZONE", "Asia/Kolkata"),
    }

    return "https://calendar.google.com/calendar/render?" + urlencode(params)


def build_event_ics(event, guest, start_dt: datetime | None = None, end_dt: datetime | None = None) -> bytes:
    """Build a single-VEVENT .ics file for one guest's invitation.

    start_dt / end_dt come from resolve_schedule(); when omitted the
    event's own start / end time is used.
    """

    if start_dt is None:
        start_dt = datetime.combine(event.event_date, event.event_time)

    if end_dt is None:
        end_time = getattr(event, "event_end_time", None)

        if end_time is not None:
            end_dt = datetime.combine(event.event_date, end_time)

            if end_dt <= start_dt:
                end_dt += timedelta(days=1)
        else:
            end_dt = start_dt + EVENT_DURATION

    dtstamp = datetime.utcnow().strftime("%Y%m%dT%H%M%SZ")
    dtstart = start_dt.strftime("%Y%m%dT%H%M%S")
    dtend = end_dt.strftime("%Y%m%dT%H%M%S")

    summary = _escape_ics_text(event.name)
    description = _escape_ics_text(_description_text(event))
    location = _escape_ics_text(_location_text(event))

    uid = f"invitation-{event.pk}-{guest.pk}@lavernaevents.com"

    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//LavernaEvents//Invitation//EN",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        "BEGIN:VEVENT",
        f"UID:{uid}",
        f"DTSTAMP:{dtstamp}",
        # Local (floating) time in the project's own timezone - simplest
        # correct option for a single-timezone project.
        f"DTSTART:{dtstart}",
        f"DTEND:{dtend}",
        f"SUMMARY:{summary}",
        f"DESCRIPTION:{description}",
    ]

    if location:
        lines.append(f"LOCATION:{location}")

    if event.google_maps_link:
        lines.append(f"URL:{_escape_ics_text(event.google_maps_link)}")

    lines.extend(
        [
            "STATUS:CONFIRMED",
            # Two built-in reminders: one day before and two hours before.
            "BEGIN:VALARM",
            "ACTION:DISPLAY",
            f"DESCRIPTION:{summary}",
            "TRIGGER:-P1D",
            "END:VALARM",
            "BEGIN:VALARM",
            "ACTION:DISPLAY",
            f"DESCRIPTION:{summary}",
            "TRIGGER:-PT2H",
            "END:VALARM",
            "END:VEVENT",
            "END:VCALENDAR",
        ]
    )

    folded = [_fold_line(line) for line in lines]

    return ("\r\n".join(folded) + "\r\n").encode("utf-8")