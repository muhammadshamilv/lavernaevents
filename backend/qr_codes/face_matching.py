"""Deciding which stored faces are "the guest".

Kept free of Django and of the face library on purpose: it only does
arithmetic on face encodings (lists of 128 numbers), so it can be tested
without dlib and tuned without touching the upload / scan code.

How a stored face is judged
---------------------------
distance = how different it is from the guest's selfie(s); smaller is more
alike. With several selfies the closest one counts.

- distance <= ``strong``  -> "high"   (almost certainly the guest)
- distance <= ``possible``, AND the face is also very close to a face that
  already counted as "high" -> "high". The same person looks different from
  photo to photo (side view, shadow, sunglasses); if a blurry side photo
  clearly belongs to the same person as a sure match, it is theirs too.
- distance <= ``possible`` otherwise -> "possible" (shown separately, as
  "might be you", so a wrong guess never sits among the sure ones).
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

HIGH = "high"
POSSIBLE = "possible"

# Largest block of face-to-face distances computed at once (rows x columns).
_CHUNK_CELLS = 2_000_000


@dataclass(frozen=True)
class FaceMatch:
    media_id: int
    confidence: str  # HIGH or POSSIBLE
    distance: float  # best (smallest) distance of any face in this photo


def pairwise_distances(first: np.ndarray, second: np.ndarray) -> np.ndarray:
    """Euclidean distance between every row of ``first`` and every row of
    ``second`` -> array of shape (len(first), len(second))."""

    squares_first = np.einsum("ij,ij->i", first, first)[:, None]
    squares_second = np.einsum("ij,ij->i", second, second)[None, :]
    squared = squares_first + squares_second - 2.0 * (first @ second.T)

    return np.sqrt(np.maximum(squared, 0.0))


def _nearest(first: np.ndarray, second: np.ndarray) -> np.ndarray:
    """For each row of ``first``, the distance to its nearest row of
    ``second``. Done in blocks so thousands of faces stay light on memory."""

    if len(second) == 0:
        return np.full(len(first), np.inf)

    rows_per_block = max(1, _CHUNK_CELLS // max(1, len(second)))
    result = np.empty(len(first))

    for start in range(0, len(first), rows_per_block):
        block = first[start : start + rows_per_block]
        result[start : start + rows_per_block] = pairwise_distances(block, second).min(axis=1)

    return result


def rank_matches(
    media_ids,
    encodings,
    probes,
    strong: float = 0.5,
    possible: float = 0.56,
    support: float = 0.42,
) -> list[FaceMatch]:
    """Which photos contain the guest, best matches first.

    ``media_ids[i]`` is the photo that ``encodings[i]`` (one stored face)
    belongs to; a photo with several faces appears several times.
    ``probes`` are the guest's own encodings (one per selfie).
    """

    if len(encodings) == 0 or len(probes) == 0:
        return []

    known = np.asarray(encodings, dtype=float)
    guest = np.asarray(probes, dtype=float)
    ids = np.asarray(media_ids)

    distance = _nearest(known, guest)

    is_high = distance <= strong

    if possible > strong:
        candidate = (~is_high) & (distance <= possible)

        if candidate.any() and is_high.any():
            to_sure_faces = _nearest(known[candidate], known[is_high])
            promoted = np.zeros(len(known), dtype=bool)
            promoted[np.flatnonzero(candidate)] = to_sure_faces <= support
            is_high = is_high | promoted
            candidate = candidate & ~promoted
    else:
        candidate = np.zeros(len(known), dtype=bool)

    keep = is_high | candidate

    best: dict[int, FaceMatch] = {}

    for index in np.flatnonzero(keep):
        media_id = int(ids[index])
        confidence = HIGH if is_high[index] else POSSIBLE
        face_distance = float(distance[index])
        current = best.get(media_id)

        # A photo is "high" if any one of its faces is; its distance is the
        # best distance among the faces of that confidence.
        if (
            current is None
            or (confidence == HIGH and current.confidence == POSSIBLE)
            or (confidence == current.confidence and face_distance < current.distance)
        ):
            best[media_id] = FaceMatch(media_id, confidence, face_distance)

    return sorted(best.values(), key=lambda match: (match.confidence != HIGH, match.distance))