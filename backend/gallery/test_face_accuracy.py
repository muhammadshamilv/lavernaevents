"""Face-search accuracy upgrade: videos, sharper scanning.

Run:  python manage.py test gallery.test_face_accuracy qr_codes.test_face_matching
"""

import io
import os
import sys
import tempfile
from types import SimpleNamespace
from unittest import mock

from django.test import SimpleTestCase

from . import face_scan


class _Library:
    """Stands in for face_recognition. Each call to face_locations returns
    one face; ``encodings`` decides what that face "looks like"."""

    def __init__(self, encodings=None):
        self.calls = 0
        self.encodings = encodings

    def face_locations(self, image):
        self.calls += 1
        return [(0, 120, 120, 0)]

    def face_encodings(self, image, locations):
        if self.encodings is None:
            return [[0.5] * 128 for _ in locations]
        return [self.encodings[(self.calls - 1) % len(self.encodings)] for _ in locations]


class _VideoFile(io.BytesIO):
    name = "clip.avi"

    def open(self, mode="rb"):
        self.seek(0)
        return self

    def close(self):
        pass


def _make_video(seconds=10, fps=10, size=(160, 120)):
    """A small real video file (moving grey frames), returned as bytes."""

    import cv2
    import numpy as np

    path = tempfile.NamedTemporaryFile(suffix=".avi", delete=False).name

    try:
        writer = cv2.VideoWriter(path, cv2.VideoWriter_fourcc(*"MJPG"), fps, size)

        for index in range(seconds * fps):
            frame = np.full((size[1], size[0], 3), index % 255, dtype=np.uint8)
            writer.write(frame)

        writer.release()

        with open(path, "rb") as handle:
            return handle.read()
    finally:
        os.unlink(path)


class VideoScanTests(SimpleTestCase):
    def _media(self, data):
        return SimpleNamespace(pk=3, media_type="VIDEO", file=_VideoFile(data))

    def test_frames_are_taken_every_few_seconds_not_every_frame(self):
        library = _Library()

        encodings = face_scan._encode_video(library, self._media(_make_video(seconds=10, fps=10)))

        # 10 s at one frame per 2 s = 5 frames looked at (not 100).
        self.assertEqual(library.calls, 5)
        # The same face in every frame is stored once.
        self.assertEqual(len(encodings), 1)

    def test_different_people_in_different_frames_are_all_kept(self):
        people = [[float(i)] * 128 for i in range(5)]  # far apart
        library = _Library(encodings=people)

        encodings = face_scan._encode_video(library, self._media(_make_video()))

        self.assertEqual(len(encodings), 5)

    def test_very_long_video_is_sampled_thinly_but_capped(self):
        library = _Library()

        # 120 s would be 60 frames at 2 s; the cap is MAX_VIDEO_FRAMES.
        with mock.patch.object(face_scan, "MAX_VIDEO_FRAMES", 10):
            face_scan._encode_video(library, self._media(_make_video(seconds=120, fps=5, size=(64, 48))))

        self.assertLessEqual(library.calls, 10)
        self.assertGreaterEqual(library.calls, 8)  # spread over the whole video

    def test_temp_file_is_removed(self):
        before = set(os.listdir(tempfile.gettempdir()))

        face_scan._encode_video(_Library(), self._media(_make_video(seconds=4)))

        leftovers = [name for name in set(os.listdir(tempfile.gettempdir())) - before if name.endswith(".avi")]
        self.assertEqual(leftovers, [])

    def test_unreadable_video_is_failed_not_raised(self):
        status, encodings = face_scan._scan_one(_Library(), self._media(b"not a video at all"))

        self.assertEqual(status, "FAILED")
        self.assertEqual(encodings, [])

    def test_scan_one_dispatches_videos(self):
        status, encodings = face_scan._scan_one(_Library(), self._media(_make_video(seconds=4)))

        self.assertEqual(status, "PROCESSED")
        self.assertEqual(len(encodings), 1)


class ScannableTypesTests(SimpleTestCase):
    def test_videos_included_when_opencv_is_installed(self):
        self.assertEqual(face_scan.scannable_media_types(), ["IMAGE", "VIDEO"])
        self.assertTrue(face_scan.video_scan_available())

    def test_videos_left_alone_without_opencv(self):
        with mock.patch.dict(sys.modules, {"cv2": None}):
            self.assertFalse(face_scan.video_scan_available())
            self.assertEqual(face_scan.scannable_media_types(), ["IMAGE"])


class ScanResolutionTests(SimpleTestCase):
    def test_photos_are_scanned_larger_than_before(self):
        self.assertGreaterEqual(face_scan.SCAN_MAX_EDGE, 2000)
        self.assertLessEqual(face_scan.MIN_FACE_PX, 36)