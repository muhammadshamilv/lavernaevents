"""The organizer's Gallery hub: every event, with what its gallery holds.

One page of events (with counts and a few preview pictures each) plus
totals across ALL of the organizer's events - the totals are not limited to
the page being shown.
"""

from django.db.models import Count, F, Max, Q, Window
from django.db.models.functions import RowNumber
from events.models import Event

from .models import GalleryMedia

PREVIEW_COUNT = 4
DEFAULT_PAGE_SIZE = 12
MAX_PAGE_SIZE = 48

PHOTOGRAPHER_ROLE = "PHOTOGRAPHER"


def _file_url(file_field) -> str | None:
    """The stored file's address, or None when there is no file."""

    if not file_field:
        return None

    try:
        return file_field.url
    except ValueError:
        return None


def get_gallery_totals(organizer) -> dict:
    """Counts across everything in the organizer's galleries."""

    return GalleryMedia.objects.filter(event__organizer=organizer).aggregate(
        photos=Count("id", filter=Q(media_type=GalleryMedia.MediaType.IMAGE)),
        videos=Count("id", filter=Q(media_type=GalleryMedia.MediaType.VIDEO)),
        from_photographers=Count("id", filter=Q(uploaded_by__role=PHOTOGRAPHER_ROLE)),
        events_with_media=Count("event", distinct=True),
    )


def _previews_for(event_ids: list[int]) -> dict[int, list[dict]]:
    """Up to PREVIEW_COUNT pictures per event: featured first, then newest."""

    if not event_ids:
        return {}

    ranked = (
        GalleryMedia.objects.filter(event_id__in=event_ids)
        .annotate(
            rank=Window(
                expression=RowNumber(),
                partition_by=[F("event_id")],
                order_by=[F("is_featured").desc(), F("created_at").desc(), F("id").desc()],
            )
        )
        .filter(rank__lte=PREVIEW_COUNT)
        .only("id", "event_id", "media_type", "thumbnail", "file")
    )

    previews: dict[int, list[dict]] = {event_id: [] for event_id in event_ids}

    for media in sorted(ranked, key=lambda item: (item.event_id, item.rank)):
        is_image = media.media_type == GalleryMedia.MediaType.IMAGE
        picture = _file_url(media.thumbnail) or (_file_url(media.file) if is_image else None)

        previews[media.event_id].append(
            {"id": media.id, "media_type": media.media_type, "thumbnail": picture}
        )

    return previews


def get_overview_page(
    organizer,
    page: int = 1,
    page_size: int = DEFAULT_PAGE_SIZE,
    search: str = "",
    photographers_only: bool = False,
) -> dict:
    """One page of the organizer's events, those with the newest uploads first."""

    events = (
        Event.objects.filter(organizer=organizer)
        .annotate(
            photo_count=Count(
                "gallery_media", filter=Q(gallery_media__media_type=GalleryMedia.MediaType.IMAGE)
            ),
            video_count=Count(
                "gallery_media", filter=Q(gallery_media__media_type=GalleryMedia.MediaType.VIDEO)
            ),
            photographer_count=Count(
                "gallery_media", filter=Q(gallery_media__uploaded_by__role=PHOTOGRAPHER_ROLE)
            ),
            last_upload_at=Max("gallery_media__created_at"),
        )
        .order_by(F("last_upload_at").desc(nulls_last=True), "-event_date", "-id")
    )

    if search:
        events = events.filter(Q(name__icontains=search) | Q(venue_name__icontains=search))

    if photographers_only:
        events = events.filter(photographer_count__gt=0)

    total = events.count()
    start = (page - 1) * page_size
    page_events = list(events[start : start + page_size])
    previews = _previews_for([event.id for event in page_events])

    results = [
        {
            "id": event.id,
            "name": event.name,
            "event_type": event.event_type,
            "custom_event_type_label": event.custom_event_type_label,
            "event_date": event.event_date.isoformat(),
            "venue_name": event.venue_name,
            "status": event.status,
            "cover_image": _file_url(event.cover_image),
            "photo_count": event.photo_count,
            "video_count": event.video_count,
            "photographer_count": event.photographer_count,
            "last_upload_at": event.last_upload_at.isoformat() if event.last_upload_at else None,
            "previews": previews.get(event.id, []),
        }
        for event in page_events
    ]

    return {
        "results": results,
        "count": total,
        "page": page,
        "page_size": page_size,
        "has_more": start + page_size < total,
        "totals": get_gallery_totals(organizer),
    }