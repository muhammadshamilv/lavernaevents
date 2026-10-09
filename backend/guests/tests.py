from datetime import date, time, timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from events.models import Event

from .models import Guest


class GuestSearchTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            mobile_number="9000000002", password="Strong@Pass91", full_name="Org", email="org2@example.com"
        )
        self.event = Event.objects.create(
            organizer=self.user, name="E", event_type="WEDDING",
            event_date=date.today() + timedelta(days=5), event_time=time(10, 0),
        )
        Guest.objects.create(event=self.event, name="Ravi", mobile_number="9876510003")
        Guest.objects.create(event=self.event, name="Other", mobile_number="9123456780")
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def _search(self, text):
        response = self.client.get(f"/api/events/{self.event.pk}/guests/", {"search": text})
        self.assertEqual(response.status_code, 200)
        return [guest["name"] for guest in response.data["data"]]

    def test_number_typed_with_country_code_is_found(self):
        for typed in ("+91 98765 10003", "919876510003", "09876510003", "9876510003", "98765 10003"):
            self.assertEqual(self._search(typed), ["Ravi"], typed)

    def test_partial_number_and_name_still_work(self):
        self.assertEqual(self._search("10003"), ["Ravi"])
        self.assertEqual(self._search("rav"), ["Ravi"])
