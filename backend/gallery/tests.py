import io

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import SimpleTestCase

from . import services
from .views import _positive_int


def _image_upload(name="a.jpg", size=(2400, 1600), orientation=None, fmt="JPEG"):
    from PIL import Image

    image = Image.new("RGB", size, (30, 120, 200))
    buffer = io.BytesIO()
    exif = Image.Exif()
    if orientation:
        exif[0x0112] = orientation
    image.save(buffer, format=fmt, exif=exif) if fmt == "JPEG" else image.save(buffer, format=fmt)
    return SimpleUploadedFile(name, buffer.getvalue(), content_type="image/jpeg")


class ThumbnailTests(SimpleTestCase):
    def test_large_image_gets_small_jpeg_thumbnail(self):
        from PIL import Image

        upload = _image_upload()
        thumb = services._check_image_and_make_thumbnail(upload)

        image = Image.open(io.BytesIO(thumb.read()))
        self.assertLessEqual(max(image.size), services.THUMBNAIL_EDGE)
        self.assertEqual(image.format, "JPEG")
        self.assertTrue(thumb.name.endswith(".jpg"))

    def test_upload_is_rewound_for_saving(self):
        upload = _image_upload()
        services._check_image_and_make_thumbnail(upload)
        self.assertEqual(upload.tell(), 0)

    def test_exif_rotation_is_applied(self):
        from PIL import Image

        upload = _image_upload(size=(800, 600), orientation=6)
        thumb = services._check_image_and_make_thumbnail(upload)
        image = Image.open(io.BytesIO(thumb.read()))
        self.assertGreater(image.height, image.width)

    def test_png_is_accepted(self):
        upload = _image_upload("b.png", size=(300, 200), fmt="PNG")
        self.assertTrue(services._check_image_and_make_thumbnail(upload).name.endswith(".jpg"))

    def test_fake_image_is_rejected(self):
        fake = SimpleUploadedFile("evil.jpg", b"<?php echo 1; ?>", content_type="image/jpeg")

        with self.assertRaises(services.GalleryError) as caught:
            services._check_image_and_make_thumbnail(fake)

        self.assertEqual(caught.exception.code, "invalid_image")


class PagingHelperTests(SimpleTestCase):
    def test_defaults_and_bounds(self):
        self.assertEqual(_positive_int(None, 1), 1)
        self.assertEqual(_positive_int("abc", 60), 60)
        self.assertEqual(_positive_int("-5", 60), 1)
        self.assertEqual(_positive_int("500", 60, 100), 100)
        self.assertEqual(_positive_int("25", 60, 100), 25)


# ---------------------------------------------------------------------
# Face scanning (no real face detector is needed: a stand-in library
# returns fixed boxes, so these tests run anywhere)
# ---------------------------------------------------------------------

import sys
from types import SimpleNamespace
from unittest import mock

from . import face_scan


class _FakeLibrary:
    def __init__(self, boxes):
        self.boxes = boxes
        self.encoded_boxes = None

    def face_locations(self, image):
        return self.boxes

    def face_encodings(self, image, locations):
        self.encoded_boxes = list(locations)
        return [[0.5] * 128 for _ in locations]


class EncodeFacesTests(SimpleTestCase):
    def test_tiny_faces_are_ignored_and_largest_comes_first(self):
        small = (0, 30, 30, 0)        # 30 px: a background speck
        medium = (0, 100, 100, 0)     # 100 px
        large = (0, 300, 300, 0)      # 300 px
        library = _FakeLibrary([small, medium, large])

        encodings = face_scan._encode_faces(library, object())

        self.assertEqual(library.encoded_boxes, [large, medium])
        self.assertEqual(len(encodings), 2)
        self.assertEqual(len(encodings[0]), 128)

    def test_no_usable_face_means_no_encodings(self):
        library = _FakeLibrary([(0, 20, 20, 0)])

        self.assertEqual(face_scan._encode_faces(library, object()), [])
        self.assertIsNone(library.encoded_boxes)

    def test_number_of_faces_per_photo_is_capped(self):
        boxes = [(0, 100 + i, 100 + i, 0) for i in range(80)]
        library = _FakeLibrary(boxes)

        self.assertEqual(len(face_scan._encode_faces(library, object())), face_scan.MAX_FACES_PER_PHOTO)


class _StoredFile(io.BytesIO):
    """Stands in for a FieldFile."""

    def open(self, mode="rb"):
        self.seek(0)
        return self

    def close(self):  # keep the buffer readable for assertions
        pass


class LoadImageTests(SimpleTestCase):
    def _media(self, upload):
        return SimpleNamespace(pk=1, file=_StoredFile(upload.read()))

    def test_large_photo_is_shrunk_for_detection(self):
        array = face_scan._load_image_array(self._media(_image_upload(size=(4000, 3000))))

        self.assertLessEqual(max(array.shape[:2]), face_scan.SCAN_MAX_EDGE)
        self.assertEqual(array.shape[2], 3)

    def test_sideways_phone_photo_is_turned_upright(self):
        # EXIF orientation 6 = rotate 90 degrees: a 2000x1000 file is a portrait.
        array = face_scan._load_image_array(self._media(_image_upload(size=(2000, 1000), orientation=6)))

        height, width = array.shape[:2]
        self.assertGreater(height, width)


class ScanOneTests(SimpleTestCase):
    def test_unreadable_photo_is_marked_failed_not_raised(self):
        from .models import GalleryMedia

        media = SimpleNamespace(pk=7, file=_StoredFile(b"this is not an image"))

        status, encodings = face_scan._scan_one(_FakeLibrary([]), media)

        self.assertEqual(status, GalleryMedia.FaceScanStatus.FAILED)
        self.assertEqual(encodings, [])

    def test_photo_without_faces_is_processed_with_nothing_stored(self):
        from .models import GalleryMedia

        media = SimpleNamespace(pk=8, file=_StoredFile(_image_upload().read()))

        status, encodings = face_scan._scan_one(_FakeLibrary([]), media)

        self.assertEqual(status, GalleryMedia.FaceScanStatus.PROCESSED)
        self.assertEqual(encodings, [])


class LibraryAvailabilityTests(SimpleTestCase):
    def setUp(self):
        face_scan._library = None
        face_scan._unavailable_until = 0.0

    def tearDown(self):
        face_scan._library = None
        face_scan._unavailable_until = 0.0

    def test_missing_library_is_reported_not_crashed(self):
        with mock.patch.dict(sys.modules, {"face_recognition": None}):
            self.assertFalse(face_scan.face_search_available())
            with self.assertRaises(face_scan.FaceSearchUnavailable):
                face_scan._load_library()

    def test_library_that_quits_on_import_is_handled(self):
        # face_recognition calls quit() when its model package is missing.
        with mock.patch("builtins.__import__", side_effect=SystemExit):
            self.assertFalse(face_scan.face_search_available())


class BackgroundRunnerTests(SimpleTestCase):
    def test_disabled_by_setting(self):
        with mock.patch.object(face_scan, "background_scan_enabled", return_value=False):
            self.assertFalse(face_scan.start_background_scan())

    def test_second_request_while_running_does_nothing(self):
        face_scan._runner_lock.acquire()
        try:
            with mock.patch.object(face_scan, "background_scan_enabled", return_value=True):
                self.assertFalse(face_scan.start_background_scan())
        finally:
            face_scan._runner_lock.release()

    def test_runner_scans_until_nothing_is_left_then_frees_the_lock(self):
        results = iter([{"attempted": 3}, {"attempted": 1}, {"attempted": 0}])

        with mock.patch.object(face_scan, "scan_pending", side_effect=lambda **kw: next(results)), \
             mock.patch.object(face_scan, "pending_queryset") as pending, \
             mock.patch.object(face_scan, "connections"):
            pending.return_value.exists.return_value = False
            face_scan._runner_lock.acquire()
            face_scan._run_background()

        self.assertTrue(face_scan._runner_lock.acquire(blocking=False))
        face_scan._runner_lock.release()

    def test_runner_frees_the_lock_when_the_library_is_missing(self):
        with mock.patch.object(face_scan, "scan_pending", side_effect=face_scan.FaceSearchUnavailable), \
             mock.patch.object(face_scan, "connections"):
            face_scan._runner_lock.acquire()
            face_scan._run_background()

        self.assertTrue(face_scan._runner_lock.acquire(blocking=False))
        face_scan._runner_lock.release()
