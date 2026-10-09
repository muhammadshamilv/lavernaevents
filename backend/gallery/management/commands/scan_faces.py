from django.core.management.base import BaseCommand, CommandError

from gallery.face_scan import (
    BATCH_SIZE,
    FaceSearchUnavailable,
    face_search_available,
    pending_queryset,
    retry_failed,
    scan_pending,
)
from gallery.models import GalleryMedia


class Command(BaseCommand):
    help = (
        "Find the faces in gallery photos that have not been scanned yet, so guests can "
        "find their photos with a selfie. Safe to run repeatedly or on a schedule."
    )

    def add_arguments(self, parser):
        parser.add_argument("--event", type=int, help="Only photos of this event id.")
        parser.add_argument("--limit", type=int, help="Scan at most this many photos.")
        parser.add_argument("--retry-failed", action="store_true", help="Scan photos that failed before, too.")
        parser.add_argument(
            "--rescan",
            action="store_true",
            help="Scan every photo again, even ones already scanned (old results are replaced).",
        )
        parser.add_argument(
            "--ignore-plan",
            action="store_true",
            help="Also scan photos of organizers whose plan does not include face search.",
        )

    def handle(self, *args, **options):
        if not face_search_available():
            raise CommandError(
                "face_recognition is not installed. Install it with: pip install -r requirements-face.txt"
            )

        event_id = options["event"]
        respect_plan = not options["ignore_plan"]

        if options["rescan"]:
            scope = GalleryMedia.objects.filter(media_type=GalleryMedia.MediaType.IMAGE)
            if event_id:
                scope = scope.filter(event_id=event_id)
            reset = scope.update(face_scan_status=GalleryMedia.FaceScanStatus.PENDING)
            self.stdout.write(f"Queued {reset} photo(s) for a fresh scan.")
        elif options["retry_failed"]:
            self.stdout.write(f"Re-queued {retry_failed(event_id)} failed photo(s).")

        waiting = pending_queryset(event_id, respect_plan).count()
        self.stdout.write(f"{waiting} photo(s) waiting.")

        remaining = options["limit"]
        totals = {"attempted": 0, "processed": 0, "failed": 0}

        try:
            while remaining is None or remaining > 0:
                batch = BATCH_SIZE if remaining is None else min(BATCH_SIZE, remaining)
                result = scan_pending(limit=batch, event_id=event_id, respect_plan=respect_plan)

                if result["attempted"] == 0:
                    break

                for key in totals:
                    totals[key] += result[key]

                if remaining is not None:
                    remaining -= result["attempted"]

                self.stdout.write(f"  ...{totals['attempted']} done")
        except FaceSearchUnavailable as error:
            raise CommandError(str(error))

        self.stdout.write(
            self.style.SUCCESS(
                f"Finished: {totals['processed']} scanned, {totals['failed']} failed."
            )
        )