import io
from datetime import date
from types import SimpleNamespace
from unittest import mock

from django.test import SimpleTestCase, override_settings

from . import services


def _fake_qr_code(name="Aisha & Rahul Wedding"):
    return SimpleNamespace(
        token="11111111-2222-3333-4444-555555555555",
        event=SimpleNamespace(name=name, event_date=date(2026, 12, 20)),
    )


@override_settings(FRONTEND_BASE_URL="https://app.example.com/")
class QRBuildTests(SimpleTestCase):
    def test_scan_url_uses_token_and_frontend_base(self):
        self.assertEqual(
            services.build_scan_url(_fake_qr_code()),
            "https://app.example.com/scan/11111111-2222-3333-4444-555555555555",
        )

    def test_png_is_a_png(self):
        self.assertTrue(services.generate_qr_png_bytes(_fake_qr_code()).startswith(b"\x89PNG"))

    def test_pdf_builds_for_long_and_unicode_names(self):
        for name in ("X" * 400, "Müller & Łukasz <Wedding>", "Aisha & Rahul"):
            pdf = services.generate_qr_pdf_bytes(_fake_qr_code(name))
            self.assertTrue(pdf.startswith(b"%PDF"))


class SelfieLoadingTests(SimpleTestCase):
    def _jpeg(self, size=(3000, 2000), orientation=None):
        from PIL import Image

        image = Image.new("RGB", size, (200, 120, 90))
        buffer = io.BytesIO()
        exif = Image.Exif()
        if orientation:
            exif[0x0112] = orientation
        image.save(buffer, format="JPEG", exif=exif)
        buffer.seek(0)
        return buffer

    def test_large_selfie_is_shrunk(self):
        array = services._load_selfie_array(self._jpeg())
        self.assertLessEqual(max(array.shape[:2]), services.SELFIE_MAX_EDGE)

    def test_exif_rotation_is_applied(self):
        # Stored landscape with "rotate 90" flag => should come out portrait.
        array = services._load_selfie_array(self._jpeg(size=(800, 600), orientation=6))
        self.assertGreater(array.shape[0], array.shape[1])

    def test_garbage_is_rejected_cleanly(self):
        with self.assertRaises(services.QRCodeError) as caught:
            services._load_selfie_array(io.BytesIO(b"not an image"))
        self.assertEqual(caught.exception.code, "invalid_image")


class LargestFaceTests(SimpleTestCase):
    def test_picks_the_biggest_face(self):
        fake = mock.Mock()
        # (top, right, bottom, left): second box is much larger.
        fake.face_locations.return_value = [(0, 10, 10, 0), (0, 100, 100, 0)]
        fake.face_encodings.return_value = ["encoding"]

        result = services._largest_face_encoding(fake, object())

        self.assertEqual(result, "encoding")
        fake.face_encodings.assert_called_once()
        self.assertEqual(fake.face_encodings.call_args[0][1], [(0, 100, 100, 0)])

    def test_no_face_raises(self):
        fake = mock.Mock()
        fake.face_locations.return_value = []

        with self.assertRaises(services.QRCodeError) as caught:
            services._largest_face_encoding(fake, object())

        self.assertEqual(caught.exception.code, "no_face_detected")
