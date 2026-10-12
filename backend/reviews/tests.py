from django.core.cache import cache
from django.test import TestCase
from rest_framework.test import APIClient

from users.models import User

from . import services
from .models import Review

URL = "/api/reviews/"
ADMIN_URL = "/api/admin-panel/reviews/"

GOOD = {
    "name": "Meera",
    "title": "Wedding host",
    "rating": 5,
    "message": "Sending invitations was so easy and guests loved it.",
}


def _user(mobile, role):
    return User.objects.create_user(
        mobile_number=mobile, password="Strong@Pass91", full_name=f"U{mobile}", email=f"{mobile}@x.test", role=role
    )


class PublicReviewTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()

    def test_submission_is_stored_unpublished(self):
        response = self.client.post(URL, GOOD, format="json")

        self.assertEqual(response.status_code, 201)
        review = Review.objects.get()
        self.assertFalse(review.is_published)
        self.assertFalse(review.is_read)
        self.assertEqual(review.rating, 5)

    def test_only_published_reviews_are_listed(self):
        Review.objects.create(name="A", rating=5, message="Published review text", is_published=True)
        Review.objects.create(name="B", rating=1, message="Hidden review text here")

        data = self.client.get(URL).json()["data"]

        self.assertEqual([r["name"] for r in data["results"]], ["A"])
        self.assertEqual(data["count"], 1)
        self.assertEqual(data["average"], 5.0)
        self.assertNotIn("is_published", data["results"][0])

    def test_empty_site_has_no_average(self):
        data = self.client.get(URL).json()["data"]

        self.assertEqual(data["count"], 0)
        self.assertIsNone(data["average"])

    def test_rating_must_be_one_to_five(self):
        for bad in (0, 6, "x"):
            response = self.client.post(URL, {**GOOD, "rating": bad}, format="json")
            self.assertEqual(response.status_code, 400, bad)

        self.assertEqual(Review.objects.count(), 0)

    def test_short_or_linked_messages_are_refused(self):
        self.assertEqual(self.client.post(URL, {**GOOD, "message": "nice"}, format="json").status_code, 400)
        linked = {**GOOD, "message": "great app, visit https://spam.example now"}
        self.assertEqual(self.client.post(URL, linked, format="json").status_code, 400)

    def test_honeypot_pretends_success_and_stores_nothing(self):
        response = self.client.post(URL, {**GOOD, "website": "http://bot.example"}, format="json")

        self.assertEqual(response.status_code, 201)
        self.assertEqual(Review.objects.count(), 0)

    def test_unknown_fields_cannot_publish_a_review(self):
        self.client.post(URL, {**GOOD, "is_published": True, "is_read": True}, format="json")

        review = Review.objects.get()
        self.assertFalse(review.is_published)
        self.assertFalse(review.is_read)

    def test_double_submit_is_stored_once(self):
        self.client.post(URL, GOOD, format="json")
        again = self.client.post(URL, GOOD, format="json")

        self.assertEqual(again.status_code, 201)
        self.assertEqual(Review.objects.count(), 1)

    def test_hourly_cap(self):
        original = services.MAX_PER_HOUR
        services.MAX_PER_HOUR = 2
        try:
            for index in range(2):
                ok = self.client.post(URL, {**GOOD, "message": f"Review number {index} is long enough"}, format="json")
                self.assertEqual(ok.status_code, 201)
            blocked = self.client.post(URL, {**GOOD, "message": "One review too many for the hour"}, format="json")
        finally:
            services.MAX_PER_HOUR = original

        self.assertEqual(blocked.status_code, 429)
        self.assertEqual(Review.objects.count(), 2)

    def test_pending_cap(self):
        original = services.MAX_PENDING
        services.MAX_PENDING = 1
        try:
            self.client.post(URL, GOOD, format="json")
            blocked = self.client.post(URL, {**GOOD, "message": "A different review that is long"}, format="json")
        finally:
            services.MAX_PENDING = original

        self.assertEqual(blocked.status_code, 429)

    def test_control_characters_are_stripped(self):
        self.client.post(URL, {**GOOD, "name": "Me\x07era", "message": "Lovely\x07 service, truly lovely"}, format="json")

        review = Review.objects.get()
        self.assertEqual(review.name, "Meera")
        self.assertNotIn("\x07", review.message)

    def test_null_characters_are_refused(self):
        response = self.client.post(URL, {**GOOD, "name": "Me\x00era"}, format="json")

        self.assertEqual(response.status_code, 400)
        self.assertEqual(Review.objects.count(), 0)


class AdminReviewTests(TestCase):
    def setUp(self):
        cache.clear()
        self.admin = _user("9000000001", "ADMIN")
        self.organizer = _user("9000000002", "ORGANIZER")
        self.client = APIClient()
        self.client.force_authenticate(self.admin)
        self.a = Review.objects.create(name="Asha", rating=5, message="Wonderful experience overall")
        self.b = Review.objects.create(name="Bilal", rating=2, message="Could be better in places", is_read=True)

    def test_only_admins_may_moderate(self):
        for user in (None, self.organizer):
            client = APIClient()
            if user:
                client.force_authenticate(user)
            self.assertIn(client.get(ADMIN_URL).status_code, (401, 403))
            self.assertIn(client.patch(f"{ADMIN_URL}{self.a.pk}/", {"is_published": True}, format="json").status_code, (401, 403))
            self.assertIn(client.delete(f"{ADMIN_URL}{self.a.pk}/").status_code, (401, 403))

        self.a.refresh_from_db()
        self.assertFalse(self.a.is_published)
        self.assertTrue(Review.objects.filter(pk=self.a.pk).exists())

    def test_list_counts_and_filters(self):
        data = self.client.get(ADMIN_URL).json()["data"]
        self.assertEqual(data["counts"], {"total": 2, "unread": 1, "published": 0})
        self.assertEqual(len(data["results"]), 2)

        new = self.client.get(ADMIN_URL, {"status": "new"}).json()["data"]["results"]
        self.assertEqual([r["name"] for r in new], ["Asha"])

        low = self.client.get(ADMIN_URL, {"rating": 2}).json()["data"]["results"]
        self.assertEqual([r["name"] for r in low], ["Bilal"])

        found = self.client.get(ADMIN_URL, {"search": "wonderful"}).json()["data"]["results"]
        self.assertEqual([r["name"] for r in found], ["Asha"])

    def test_limit_zero_returns_only_counts(self):
        data = self.client.get(ADMIN_URL, {"limit": 0}).json()["data"]

        self.assertEqual(data["results"], [])
        self.assertEqual(data["counts"]["unread"], 1)

    def test_publish_marks_read_and_shows_publicly(self):
        response = self.client.patch(f"{ADMIN_URL}{self.a.pk}/", {"is_published": True}, format="json")

        self.assertEqual(response.status_code, 200)
        self.a.refresh_from_db()
        self.assertTrue(self.a.is_published)
        self.assertTrue(self.a.is_read)
        names = [r["name"] for r in APIClient().get(URL).json()["data"]["results"]]
        self.assertEqual(names, ["Asha"])

    def test_text_cannot_be_edited(self):
        self.client.patch(f"{ADMIN_URL}{self.a.pk}/", {"message": "Rewritten by admin", "rating": 1}, format="json")

        self.a.refresh_from_db()
        self.assertEqual(self.a.message, "Wonderful experience overall")
        self.assertEqual(self.a.rating, 5)

    def test_unpublish(self):
        self.a.is_published = True
        self.a.save()

        self.client.patch(f"{ADMIN_URL}{self.a.pk}/", {"is_published": False}, format="json")

        self.assertEqual(APIClient().get(URL).json()["data"]["count"], 0)

    def test_delete_and_missing(self):
        self.assertEqual(self.client.delete(f"{ADMIN_URL}{self.a.pk}/").status_code, 200)
        self.assertFalse(Review.objects.filter(pk=self.a.pk).exists())
        self.assertEqual(self.client.delete(f"{ADMIN_URL}{self.a.pk}/").status_code, 404)

    def test_mark_all_read(self):
        response = self.client.post(f"{ADMIN_URL}mark-all-read/")

        self.assertEqual(response.json()["data"]["updated"], 1)
        self.assertEqual(Review.objects.filter(is_read=False).count(), 0)