"""Which stored faces count as the guest (see face_matching.py)."""

from unittest import mock

import numpy as np
from django.test import SimpleTestCase

from . import services
from .face_matching import HIGH, POSSIBLE, rank_matches


def _unit(rng):
    vector = rng.normal(size=128)
    return vector / np.linalg.norm(vector)


class _Faces:
    """Faces at known distances from a base face."""

    def __init__(self):
        self.rng = np.random.default_rng(7)
        self.me = _unit(self.rng) * 0.6

    def at(self, distance, base=None):
        base = self.me if base is None else base
        return base + _unit(self.rng) * distance

    def stranger(self):
        return _unit(self.rng) * 0.6


class RankMatchesTests(SimpleTestCase):
    def setUp(self):
        self.faces = _Faces()

    def test_nothing_stored_or_no_selfie_gives_nothing(self):
        self.assertEqual(rank_matches([], [], [self.faces.me]), [])
        self.assertEqual(rank_matches([1], [self.faces.me], []), [])

    def test_close_face_is_high_and_a_stranger_is_dropped(self):
        result = rank_matches([1, 2], [self.faces.at(0.3), self.faces.stranger()], [self.faces.me])

        self.assertEqual([(m.media_id, m.confidence) for m in result], [(1, HIGH)])

    def test_borderline_face_is_possible_not_high(self):
        result = rank_matches([1], [self.faces.at(0.53)], [self.faces.me])

        self.assertEqual([(m.media_id, m.confidence) for m in result], [(1, POSSIBLE)])

    def test_borderline_face_next_to_a_sure_face_is_promoted(self):
        sure = self.faces.at(0.3)
        side_view = self.faces.at(0.25, base=sure)  # ~0.53 from the selfie, 0.25 from the sure face
        stored = [sure, side_view]

        result = rank_matches([1, 2], stored, [self.faces.me])

        self.assertEqual({m.media_id: m.confidence for m in result}, {1: HIGH, 2: HIGH})

    def test_nothing_is_promoted_without_a_sure_face(self):
        borderline = self.faces.at(0.53)

        result = rank_matches([1], [borderline], [self.faces.me])

        self.assertEqual(result[0].confidence, POSSIBLE)

    def test_possible_tier_can_be_switched_off(self):
        result = rank_matches([1], [self.faces.at(0.53)], [self.faces.me], strong=0.5, possible=0.5)

        self.assertEqual(result, [])

    def test_best_of_several_selfies_counts(self):
        selfie_front = self.faces.me
        selfie_side = self.faces.at(0.4)
        far_from_front = self.faces.at(0.4, base=selfie_side)  # near the side selfie only

        one = rank_matches([1], [far_from_front], [selfie_front], possible=0.5)
        both = rank_matches([1], [far_from_front], [selfie_front, selfie_side], possible=0.5)

        self.assertEqual(one, [])
        self.assertEqual([(m.media_id, m.confidence) for m in both], [(1, HIGH)])

    def test_photo_with_several_faces_is_listed_once_with_its_best(self):
        result = rank_matches(
            [5, 5, 5],
            [self.faces.stranger(), self.faces.at(0.45), self.faces.at(0.2)],
            [self.faces.me],
        )

        self.assertEqual(len(result), 1)
        self.assertEqual(result[0].media_id, 5)
        self.assertAlmostEqual(result[0].distance, 0.2, places=5)

    def test_sure_matches_come_before_possible_ones_then_closest_first(self):
        stored = [self.faces.at(0.54), self.faces.at(0.4), self.faces.at(0.2), self.faces.at(0.52)]

        result = rank_matches([1, 2, 3, 4], stored, [self.faces.me], support=0.0)

        self.assertEqual([m.media_id for m in result], [3, 2, 4, 1])
        self.assertEqual([m.confidence for m in result], [HIGH, HIGH, POSSIBLE, POSSIBLE])

    def test_thousands_of_faces_stay_fast_and_light(self):
        rng = np.random.default_rng(3)
        stored = rng.normal(size=(6000, 128)) * 0.05
        ids = list(range(6000))

        result = rank_matches(ids, stored, [self.faces.me])

        self.assertEqual(result, [])


class SelfieEncodingTests(SimpleTestCase):
    def test_second_look_is_taken_when_the_first_finds_no_face(self):
        fake = mock.Mock()
        fake.face_locations.side_effect = [[], [(0, 100, 100, 0)]]
        fake.face_encodings.return_value = ["encoding"]

        self.assertEqual(services._largest_face_encoding(fake, object()), "encoding")
        self.assertEqual(fake.face_locations.call_count, 2)
        self.assertEqual(fake.face_locations.call_args.kwargs, {"number_of_times_to_upsample": 2})

    def test_selfie_is_encoded_with_extra_care(self):
        fake = mock.Mock()
        fake.face_locations.return_value = [(0, 100, 100, 0)]
        fake.face_encodings.return_value = ["encoding"]

        services._largest_face_encoding(fake, object())

        self.assertEqual(fake.face_encodings.call_args.kwargs, {"num_jitters": services.SELFIE_ENCODING_JITTERS})

    def test_no_face_even_after_second_look_is_reported(self):
        fake = mock.Mock()
        fake.face_locations.return_value = []

        with self.assertRaises(services.QRCodeError) as caught:
            services._largest_face_encoding(fake, object())

        self.assertEqual(caught.exception.code, "no_face_detected")