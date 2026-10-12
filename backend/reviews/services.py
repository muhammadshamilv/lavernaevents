"""Rules for taking in and moderating reviews (kept apart from the views so
they are easy to test)."""

from datetime import timedelta

from django.core.cache import cache
from django.db.models import Avg, Count, Q
from django.utils import timezone

from .models import Review

# A stranger cannot flood the table: at most this many reviews may sit waiting
# for an admin, and at most this many new ones are accepted per hour in total.
# (The per-visitor request limit is the project's normal API throttle.)
MAX_PENDING = 300
MAX_PER_HOUR = 40
_HOURLY_KEY = "reviews:accepted-this-hour"

PUBLIC_LIMIT = 12


class ReviewRejected(Exception):
    """A review was refused for a reason the visitor can be told."""

    def __init__(self, message: str):
        super().__init__(message)
        self.message = message


def _count_this_hour() -> int:
    return int(cache.get(_HOURLY_KEY, 0))


def _note_accepted() -> None:
    # add() creates the key with its 1-hour life only the first time.
    cache.add(_HOURLY_KEY, 0, timeout=3600)
    try:
        cache.incr(_HOURLY_KEY)
    except ValueError:
        cache.set(_HOURLY_KEY, 1, timeout=3600)


def submit_review(*, name: str, title: str, rating: int, message: str) -> Review | None:
    """Store a new, unpublished review.

    Returns None when the same words from the same name already arrived in the
    last day (a double-click or a retry): the visitor still sees "thank you".
    """

    if _count_this_hour() >= MAX_PER_HOUR:
        raise ReviewRejected("We're receiving a lot of reviews right now. Please try again a little later.")

    if Review.objects.filter(is_published=False).count() >= MAX_PENDING:
        raise ReviewRejected("Reviews are temporarily paused. Please try again later.")

    since = timezone.now() - timedelta(days=1)
    if Review.objects.filter(name__iexact=name, message=message, created_at__gte=since).exists():
        return None

    review = Review.objects.create(name=name, title=title, rating=rating, message=message)
    _note_accepted()
    return review


def published_summary() -> dict:
    """Headline numbers for the public site: how many, and the average."""

    stats = Review.objects.filter(is_published=True).aggregate(count=Count("id"), average=Avg("rating"))
    average = stats["average"]

    return {
        "count": stats["count"] or 0,
        "average": round(float(average), 1) if average is not None else None,
    }


def admin_counts() -> dict:
    stats = Review.objects.aggregate(
        total=Count("id"),
        unread=Count("id", filter=Q(is_read=False)),
        published=Count("id", filter=Q(is_published=True)),
    )
    return {key: value or 0 for key, value in stats.items()}