"""The organizer's Gallery hub (GET /api/gallery/overview/).

Run:  python manage.py test gallery.test_overview
"""

from datetime import date, time, timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from events.models import Event

from .models import GalleryMedia
from .overview import PREVIEW_COUNT, get_gallery_totals, get_overview_page


def _user(mobile, role="ORGANIZER", name="Someone"):
    user = get_user_model().objects.create_user(
        mobile_number=mobile,
        password="Strong@Pass91",
        full_name=name,
        email=f"{mobile}@example.com",
    )
    user.role = role
    user.is_verified = True
    user.save()
    return user


def _event(organizer, name="Wedding", day=1, venue=""):
    return Event.objects.create(
        organizer=organizer,
        name=name,
        event_type="WEDDING",
        event_date=date(2026, 12, day),
        event_time=time(18, 0),
        venue_name=venue,
    )


def _media(event, uploader, kind="IMAGE", number=0, featured=False, thumbnail=True):
    return GalleryMedia.objects.create(
        event=event,
        uploaded_by=uploader,
        media_type=kind,
        file=f"gallery/{event.pk}-{number}.{'jpg' if kind == 'IMAGE' else 'mp4'}",
        thumbnail=f"gallery/thumbnails/{event.pk}-{number}.jpg" if thumbnail else None,
        is_featured=featured,
    )


class OverviewTests(TestCase):
    def setUp(self):
        self.organizer = _user("9000000101", name="Organizer")
        self.photographer = _user("9000000102", role="PHOTOGRAPHER", name="Photographer")
        self.other = _user("9000000103", name="Other organizer")

    def test_counts_split_photos_videos_and_photographer_uploads(self):
        event = _event(self.organizer)
        _media(event, self.organizer, "IMAGE", 1)
        _media(event, self.photographer, "IMAGE", 2)
        _media(event, self.photographer, "VIDEO", 3)

        page = get_overview_page(self.organizer)

        row = page["results"][0]
        self.assertEqual((row["photo_count"], row["video_count"], row["photographer_count"]), (2, 1, 2))
        self.assertEqual(page["totals"], {"photos": 2, "videos": 1, "from_photographers": 2, "events_with_media": 1})

    def test_event_without_uploads_is_listed_with_zero_counts(self):
        _event(self.organizer, "Empty")

        row = get_overview_page(self.organizer)["results"][0]

        self.assertEqual((row["photo_count"], row["video_count"], row["previews"]), (0, 0, []))
        self.assertIsNone(row["last_upload_at"])

    def test_only_my_events_and_my_media_are_counted(self):
        mine = _event(self.organizer, "Mine")
        theirs = _event(self.other, "Theirs")
        _media(mine, self.organizer, number=1)
        _media(theirs, self.other, number=2)

        page = get_overview_page(self.organizer)

        self.assertEqual([row["name"] for row in page["results"]], ["Mine"])
        self.assertEqual(page["totals"]["photos"], 1)

    def test_events_with_the_newest_uploads_come_first_then_empty_ones(self):
        old = _event(self.organizer, "Old upload", day=1)
        new = _event(self.organizer, "New upload", day=2)
        _event(self.organizer, "No upload", day=28)
        first = _media(old, self.organizer, number=1)
        second = _media(new, self.organizer, number=2)
        GalleryMedia.objects.filter(pk=first.pk).update(created_at=timezone.now() - timedelta(days=3))
        GalleryMedia.objects.filter(pk=second.pk).update(created_at=timezone.now())

        names = [row["name"] for row in get_overview_page(self.organizer)["results"]]

        self.assertEqual(names, ["New upload", "Old upload", "No upload"])

    def test_previews_are_capped_and_featured_comes_first(self):
        event = _event(self.organizer)
        for number in range(PREVIEW_COUNT + 3):
            _media(event, self.organizer, number=number)
        star = _media(event, self.organizer, number=99, featured=True)

        previews = get_overview_page(self.organizer)["results"][0]["previews"]

        self.assertEqual(len(previews), PREVIEW_COUNT)
        self.assertEqual(previews[0]["id"], star.id)

    def test_video_without_a_thumbnail_has_no_picture_but_an_image_falls_back_to_its_file(self):
        event = _event(self.organizer)
        video = _media(event, self.organizer, "VIDEO", 1, thumbnail=False)
        image = _media(event, self.organizer, "IMAGE", 2, thumbnail=False)

        previews = {item["id"]: item for item in get_overview_page(self.organizer)["results"][0]["previews"]}

        self.assertIsNone(previews[video.id]["thumbnail"])
        self.assertTrue(previews[image.id]["thumbnail"].endswith(".jpg"))

    def test_search_and_photographer_filter(self):
        wedding = _event(self.organizer, "Aisha Wedding", venue="Grand Hall")
        _event(self.organizer, "Birthday", venue="Beach")
        _media(wedding, self.photographer, number=1)

        self.assertEqual([r["name"] for r in get_overview_page(self.organizer, search="grand")["results"]], ["Aisha Wedding"])
        self.assertEqual([r["name"] for r in get_overview_page(self.organizer, search="birth")["results"]], ["Birthday"])
        self.assertEqual(
            [r["name"] for r in get_overview_page(self.organizer, photographers_only=True)["results"]],
            ["Aisha Wedding"],
        )

    def test_paging(self):
        for number in range(5):
            _event(self.organizer, f"Event {number}", day=number + 1)

        first = get_overview_page(self.organizer, page=1, page_size=2)
        last = get_overview_page(self.organizer, page=3, page_size=2)

        self.assertEqual((len(first["results"]), first["count"], first["has_more"]), (2, 5, True))
        self.assertEqual((len(last["results"]), last["has_more"]), (1, False))

    def test_totals_ignore_paging_and_filters(self):
        event = _event(self.organizer)
        _event(self.organizer, "Other")
        _media(event, self.organizer, number=1)

        page = get_overview_page(self.organizer, search="zzz")

        self.assertEqual(page["results"], [])
        self.assertEqual(page["totals"]["photos"], 1)
        self.assertEqual(get_gallery_totals(self.organizer)["events_with_media"], 1)


class OverviewEndpointTests(TestCase):
    def setUp(self):
        self.organizer = _user("9000000111")
        self.client = APIClient()

    def test_organizer_gets_the_overview(self):
        _event(self.organizer, "Mine")
        self.client.force_authenticate(self.organizer)

        response = self.client.get("/api/gallery/overview/?page_size=500&search=%20Mi%20")

        self.assertEqual(response.status_code, 200)
        data = response.json()["data"]
        self.assertEqual([row["name"] for row in data["results"]], ["Mine"])
        self.assertLessEqual(data["page_size"], 48)

    def test_photographer_is_refused(self):
        photographer = _user("9000000112", role="PHOTOGRAPHER")
        self.client.force_authenticate(photographer)

        self.assertEqual(self.client.get("/api/gallery/overview/").status_code, 403)

    def test_anonymous_is_refused(self):
        self.assertIn(self.client.get("/api/gallery/overview/").status_code, (401, 403))