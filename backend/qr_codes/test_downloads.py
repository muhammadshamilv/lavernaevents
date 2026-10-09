"""Phase 16: a QR holder can only download photos the selfie search returned.

Run:  python manage.py test qr_codes.test_downloads gallery.test_filenames
"""

import io
import tempfile
from datetime import date, time, timedelta
from urllib.parse import parse_qs, urlparse

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import SimpleTestCase, TestCase, override_settings
from PIL import Image
from rest_framework.test import APIClient

from events.models import Event
from gallery.models import GalleryMedia

from .download_tokens import download_token_is_valid, make_download_token
from .serializers import GuestMediaSerializer
from .services import get_or_create_event_qr_code


def _png():
    buffer = io.BytesIO()
    Image.new("RGB", (8, 8), "green").save(buffer, format="PNG")
    return buffer.getvalue()


class DownloadTokenTests(SimpleTestCase):
    def test_round_trip(self):
        signed = make_download_token("abc", 7)
        self.assertTrue(download_token_is_valid(signed, "abc", 7))

    def test_wrong_photo_or_wrong_qr_is_refused(self):
        signed = make_download_token("abc", 7)
        self.assertFalse(download_token_is_valid(signed, "abc", 8))
        self.assertFalse(download_token_is_valid(signed, "xyz", 7))

    def test_tampered_or_empty_is_refused(self):
        signed = make_download_token("abc", 7)
        self.assertFalse(download_token_is_valid(signed[:-2] + "xx", "abc", 7))
        self.assertFalse(download_token_is_valid("", "abc", 7))
        self.assertFalse(download_token_is_valid("garbage", "abc", 7))

    @override_settings(GUEST_DOWNLOAD_TTL_SECONDS=-1)
    def test_expired_is_refused(self):
        signed = make_download_token("abc", 7)
        self.assertFalse(download_token_is_valid(signed, "abc", 7))


class GuestDownloadViewTests(TestCase):
    def setUp(self):
        cache.clear()
        self._media_root = tempfile.TemporaryDirectory()
        self.addCleanup(self._media_root.cleanup)
        self._override = override_settings(MEDIA_ROOT=self._media_root.name)
        self._override.enable()
        self.addCleanup(self._override.disable)

        user = get_user_model().objects.create_user(
            mobile_number="9000000077", password="Strong@Pass91", full_name="Org", email="org77@example.com"
        )
        self.event = Event.objects.create(
            organizer=user, name="Wedding", event_type="WEDDING",
            event_date=date.today() + timedelta(days=5), event_time=time(10, 0),
        )
        self.qr = get_or_create_event_qr_code(self.event)
        self.mine = self._media("mine.png")
        self.other = self._media("other.png")
        self.client = APIClient()

    def _media(self, name):
        return GalleryMedia.objects.create(
            event=self.event, media_type="IMAGE",
            file=SimpleUploadedFile(name, _png(), "image/png"),
        )

    def _url(self, media, token=None, signed=None):
        url = f"/api/qr/{self.qr.token}/media/{media.id}/download/"
        if signed is not None:
            url += f"?t={signed}"
        return url

    def _signed_for(self, media):
        return make_download_token(self.qr.token, media.id)

    def test_without_token_is_not_found(self):
        self.assertEqual(self.client.get(self._url(self.mine)).status_code, 404)

    def test_walking_ids_does_not_work(self):
        for media in (self.mine, self.other):
            self.assertEqual(self.client.get(self._url(media)).status_code, 404)

    def test_valid_token_downloads_that_photo(self):
        response = self.client.get(self._url(self.mine, signed=self._signed_for(self.mine)))
        self.assertEqual(response.status_code, 200)
        self.assertIn("attachment", response["Content-Disposition"])
        self.assertIn("no-store", response["Cache-Control"])
        # Read the stream to the end: the test client then closes the file
        # itself. Calling response.close() by hand fires request_finished,
        # which closes the test's DB connection mid-transaction and made every
        # later test fail in setUp with "connection already closed".
        b"".join(response.streaming_content)

    def test_token_for_one_photo_does_not_open_another(self):
        response = self.client.get(self._url(self.other, signed=self._signed_for(self.mine)))
        self.assertEqual(response.status_code, 404)

    @override_settings(GUEST_DOWNLOAD_TTL_SECONDS=-1)
    def test_expired_token_is_not_found(self):
        response = self.client.get(self._url(self.mine, signed=self._signed_for(self.mine)))
        self.assertEqual(response.status_code, 404)

    def test_switched_off_qr_code_is_not_found(self):
        self.qr.is_active = False
        self.qr.save()
        response = self.client.get(self._url(self.mine, signed=self._signed_for(self.mine)))
        self.assertEqual(response.status_code, 404)

    def test_serializer_issues_a_working_link(self):
        data = GuestMediaSerializer(
            self.mine, context={"request": None, "token": str(self.qr.token)}
        ).data
        parsed = urlparse(data["download_url"])
        signed = parse_qs(parsed.query)["t"][0]

        self.assertTrue(download_token_is_valid(signed, self.qr.token, self.mine.id))
        response = self.client.get(f"{parsed.path}?{parsed.query}")
        self.assertEqual(response.status_code, 200)
        b"".join(response.streaming_content)