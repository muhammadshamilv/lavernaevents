"""Phase 16: gallery files are stored under random, unguessable names."""

import re

from django.test import SimpleTestCase

from .services import random_filename

_RANDOM = re.compile(r"^[0-9a-f]{32}\.(jpg|jpeg|png|webp|mp4|mov|webm)$")


class RandomFilenameTests(SimpleTestCase):
    def test_original_name_is_never_reused(self):
        for name in ("face1.jpeg", "Wedding Final 3.JPG", "../../etc/passwd.png", "ravi & meera.webp"):
            result = random_filename(name, ".jpg")
            self.assertRegex(result, _RANDOM)
            self.assertNotIn("face1", result)
            self.assertNotIn("ravi", result.lower())

    def test_extension_is_kept_lowercase(self):
        self.assertTrue(random_filename("A.PNG", ".jpg").endswith(".png"))
        self.assertTrue(random_filename("clip.MOV", ".mp4").endswith(".mov"))

    def test_unknown_or_missing_extension_falls_back(self):
        self.assertTrue(random_filename("run.exe", ".jpg").endswith(".jpg"))
        self.assertTrue(random_filename("", ".mp4").endswith(".mp4"))
        self.assertTrue(random_filename(None, ".jpg").endswith(".jpg"))

    def test_names_are_unique(self):
        self.assertEqual(len({random_filename("a.jpg", ".jpg") for _ in range(500)}), 500)