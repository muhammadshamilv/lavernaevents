"""Builds the "Add to Calendar" data for the guest invitation page:
an .ics file (Apple / Outlook / any calendar app) and a one-tap
Google Calendar link.

The .ics is hand-rolled rather than pulling in a library - the RFC 5545
subset needed here (one VEVENT, a few fields, correct line folding) is
small and stable.
"""

import html
from datetime import datetime, time, timedelta, timezone
from urllib.parse import urlencode

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

    start_time = event.event_time or time(0, 0)
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

    value = (value or "").replace("\r\n", "\n").replace("\r", "\n")

    return (
        value.replace("\\", "\\\\")
        .replace(";", "\\;")
        .replace(",", "\\,")
        .replace("\n", "\\n")
    )


def _fold_line(line: str) -> str:
    """Fold lines longer than 75 OCTETS (not characters) per RFC 5545
    (section 3.1). Names with Malayalam / Hindi text are 3 bytes per
    character, so a character count would produce lines that are too long
    and some calendar apps would reject the file. A character is never
    split across two lines."""

    if len(line.encode("utf-8")) <= 75:
        return line

    parts: list[str] = []
    current = ""
    current_bytes = 0
    limit = 75

    for char in line:
        size = len(char.encode("utf-8"))

        if current_bytes + size > limit:
            parts.append(current)
            current = char
            current_bytes = size
            # Continuation lines start with one space, which counts too.
            limit = 74
        else:
            current += char
            current_bytes += size

    if current:
        parts.append(current)

    return "\r\n ".join(parts)


def _plain_text(value: str) -> str:
    """Event descriptions may hold HTML; calendars want plain text."""

    return html.unescape(strip_tags(value or "")).strip()


def _description_text(event) -> str:
    lines = [f"You're invited to {event.name}."]

    description = _plain_text(event.description)

    if description:
        lines.append(description)

    return "\n".join(lines)


def _location_text(event) -> str:
    return ", ".join(part for part in (event.venue_name, event.address) if part)


def _safe_http_url(value: str) -> str:
    """Only plain http(s) links, no whitespace - anything else is dropped."""

    value = (value or "").strip()

    if value.lower().startswith(("http://", "https://")) and not any(
        char.isspace() for char in value
    ):
        return value

    return ""


def build_google_calendar_url(event, start_dt: datetime, end_dt: datetime) -> str:
    """A link that opens Google Calendar with the event already filled in -
    the guest only has to press Save."""

    details = _description_text(event)

    maps_link = _safe_http_url(event.google_maps_link)

    if maps_link:
        details += f"\n\nMap: {maps_link}"

    params = {
        "action": "TEMPLATE",
        "text": event.name,
        "dates": f"{start_dt.strftime('%Y%m%dT%H%M%S')}/{end_dt.strftime('%Y%m%dT%H%M%S')}",
        "details": details,
        "location": _location_text(event),
        "ctz": getattr(settings, "TIME_ZONE", "Asia/Kolkata"),
    }

    return "https://calendar.google.com/calendar/render?" + urlencode(params)


def build_event_ics(
    event,
    guest,
    start_dt: datetime | None = None,
    end_dt: datetime | None = None,
) -> bytes:
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

    dtstamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    dtstart = start_dt.strftime("%Y%m%dT%H%M%S")
    dtend = end_dt.strftime("%Y%m%dT%H%M%S")

    summary = _escape_ics_text(event.name)
    description = _escape_ics_text(_description_text(event))
    location = _escape_ics_text(_location_text(event))

    uid = f"invitation-{event.pk}-{guest.pk}@lavernaevents.com"
    time_zone = getattr(settings, "TIME_ZONE", "Asia/Kolkata")

    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//LavernaEvents//Invitation//EN",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        f"X-WR-TIMEZONE:{time_zone}",
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

    # URL is a URI value, not TEXT: it must not be text-escaped.
    maps_link = _safe_http_url(event.google_maps_link)

    if maps_link:
        lines.append(f"URL:{maps_link}")

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
