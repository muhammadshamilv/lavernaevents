"""Phase 15: upload content checks on the real serializers.

Run:  python manage.py test common.test_uploads
"""

import io

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import SimpleTestCase
from PIL import Image

from gallery.serializers import GalleryMediaUploadSerializer
from invitations.serializers import CustomTemplateUploadSerializer
from qr_codes.serializers import SelfieUploadSerializer


def _image(fmt="PNG", size=(8, 8)):
    buffer = io.BytesIO()
    Image.new("RGB", size, "blue").save(buffer, format=fmt)
    return buffer.getvalue()


def _upload(name, data, content_type="application/octet-stream"):
    return SimpleUploadedFile(name, data, content_type)


MP4 = b"\x00\x00\x00\x18ftypmp42" + b"\x00" * 64
WEBM = b"\x1a\x45\xdf\xa3" + b"\x00" * 64


class SelfieTests(SimpleTestCase):
    def check(self, upload):
        s = SelfieUploadSerializer(data={"selfie": upload})
        return s.is_valid()

    def test_png_and_jpeg_and_webp_ok(self):
        self.assertTrue(self.check(_upload("a.png", _image("PNG"))))
        self.assertTrue(self.check(_upload("a.jpg", _image("JPEG"))))
        self.assertTrue(self.check(_upload("a.webp", _image("WEBP"))))

    def test_gif_and_bmp_rejected(self):
        self.assertFalse(self.check(_upload("a.png", _image("GIF"))))
        self.assertFalse(self.check(_upload("a.jpg", _image("BMP"))))

    def test_html_and_text_rejected(self):
        self.assertFalse(self.check(_upload("a.jpg", b"<html><script>1</script></html>")))
        self.assertFalse(self.check(_upload("a.png", b"")))


class GalleryUploadTests(SimpleTestCase):
    def check(self, name, data):
        s = GalleryMediaUploadSerializer(data={"file": _upload(name, data)})
        return s, s.is_valid()

    def test_valid_files(self):
        self.assertTrue(self.check("p.jpg", _image("JPEG"))[1])
        self.assertTrue(self.check("p.png", _image("PNG"))[1])
        self.assertTrue(self.check("v.mp4", MP4)[1])
        self.assertTrue(self.check("v.mov", MP4)[1])
        self.assertTrue(self.check("v.webm", WEBM)[1])

    def test_fake_image_rejected(self):
        self.assertFalse(self.check("p.jpg", b"MZ\x90\x00 not an image")[1])

    def test_fake_video_rejected(self):
        self.assertFalse(self.check("v.mp4", b"<html>nope</html>" * 4)[1])
        self.assertFalse(self.check("v.webm", MP4)[1])

    def test_wrong_extension_rejected(self):
        self.assertFalse(self.check("run.exe", b"MZ")[1])
        self.assertFalse(self.check("noextension", _image("PNG"))[1])

    def test_media_type_inferred_from_extension(self):
        s, ok = self.check("p.png", _image("PNG"))
        self.assertTrue(ok)
        self.assertEqual(str(s.validated_data["media_type"]).lower(), "image")


class TemplateUploadTests(SimpleTestCase):
    def check(self, **files):
        data = {"name": "Royal", "channel": "EMAIL", "body_text": "Hi {guest_name}", **files}
        s = CustomTemplateUploadSerializer(data=data)
        return s.is_valid()

    def test_real_background_ok(self):
        self.assertTrue(self.check(background_image=_upload("bg.png", _image("PNG"))))

    def test_fake_background_rejected(self):
        self.assertFalse(self.check(background_image=_upload("bg.png", b"<svg onload=alert(1)>")))