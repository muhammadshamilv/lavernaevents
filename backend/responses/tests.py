from datetime import date, datetime, time
from types import SimpleNamespace

from django.test import SimpleTestCase

from .calendar import (
    _escape_ics_text,
    _fold_line,
    build_event_ics,
    build_google_calendar_url,
)


def _fake_event(**overrides):
    values = {
        "pk": 7,
        "name": "Aisha & Rahul, Wedding; Reception",
        "description": "<p>Join us &amp; celebrate</p>",
        "venue_name": "Grand Hall",
        "address": "MG Road, Kochi",
        "google_maps_link": "https://maps.google.com/?q=grand+hall",
        "event_date": date(2026, 12, 20),
        "event_time": time(19, 0),
        "event_end_time": time(22, 0),
    }
    values.update(overrides)
    return SimpleNamespace(**values)


class IcsEscapeTests(SimpleTestCase):
    def test_escapes_backslash_semicolon_comma_newline(self):
        self.assertEqual(_escape_ics_text("a;b,c\\d\ne"), "a\\;b\\,c\\\\d\\ne")

    def test_carriage_returns_become_newlines(self):
        self.assertEqual(_escape_ics_text("a\r\nb\rc"), "a\\nb\\nc")


class IcsFoldTests(SimpleTestCase):
    def test_short_line_is_untouched(self):
        self.assertEqual(_fold_line("SUMMARY:Hi"), "SUMMARY:Hi")

    def test_long_ascii_line_folds_within_75_octets(self):
        folded = _fold_line("DESCRIPTION:" + "x" * 300)

        for part in folded.split("\r\n"):
            self.assertLessEqual(len(part.encode("utf-8")), 75)

        # Unfolding gives the original back.
        self.assertEqual(folded.replace("\r\n ", ""), "DESCRIPTION:" + "x" * 300)

    def test_multibyte_text_folds_by_octets_and_never_splits_a_character(self):
        original = "SUMMARY:" + "വിവാഹം" * 30
        folded = _fold_line(original)

        for part in folded.split("\r\n"):
            self.assertLessEqual(len(part.encode("utf-8")), 75)

        self.assertEqual(folded.replace("\r\n ", ""), original)


class IcsBuildTests(SimpleTestCase):
    def test_file_is_well_formed(self):
        event = _fake_event()
        guest = SimpleNamespace(pk=3)

        ics = build_event_ics(
            event,
            guest,
            start_dt=datetime(2026, 12, 20, 19, 0),
            end_dt=datetime(2026, 12, 20, 22, 0),
        ).decode("utf-8")

        self.assertTrue(ics.startswith("BEGIN:VCALENDAR\r\n"))
        self.assertTrue(ics.endswith("END:VCALENDAR\r\n"))
        # Long lines are folded; unfold them before checking the content.
        ics = ics.replace("\r\n ", "")
        self.assertIn("DTSTART:20261220T190000", ics)
        self.assertIn("DTEND:20261220T220000", ics)
        self.assertIn("UID:invitation-7-3@lavernaevents.com", ics)
        self.assertIn("SUMMARY:Aisha & Rahul\\, Wedding\\; Reception", ics)
        # HTML in the description is turned into plain text.
        self.assertIn("Join us & celebrate", ics)
        # The URL value is not text-escaped.
        self.assertIn("URL:https://maps.google.com/?q=grand+hall", ics)

    def test_unsafe_maps_link_is_left_out(self):
        event = _fake_event(google_maps_link="javascript:alert(1)")
        ics = build_event_ics(event, SimpleNamespace(pk=1)).decode("utf-8")

        self.assertNotIn("URL:", ics)

    def test_overnight_event_ends_next_day_when_end_not_after_start(self):
        event = _fake_event(event_time=time(22, 0), event_end_time=time(1, 0))
        ics = build_event_ics(event, SimpleNamespace(pk=1)).decode("utf-8")

        self.assertIn("DTEND:20261221T010000", ics)

    def test_no_end_time_defaults_to_two_hours(self):
        event = _fake_event(event_end_time=None)
        ics = build_event_ics(event, SimpleNamespace(pk=1)).decode("utf-8")

        self.assertIn("DTEND:20261220T210000", ics)


class GoogleCalendarUrlTests(SimpleTestCase):
    def test_url_carries_dates_and_title(self):
        url = build_google_calendar_url(
            _fake_event(),
            datetime(2026, 12, 20, 19, 0),
            datetime(2026, 12, 20, 22, 0),
        )

        self.assertTrue(url.startswith("https://calendar.google.com/calendar/render?"))
        self.assertIn("dates=20261220T190000%2F20261220T220000", url)
        self.assertIn("action=TEMPLATE", url)
