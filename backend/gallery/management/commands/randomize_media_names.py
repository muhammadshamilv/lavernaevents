"""Give EXISTING gallery files unguessable names.

New uploads already get random names (gallery/services.py). Files uploaded
before that still have names like "face1.jpeg", so their addresses can be
guessed. This copies each such file to a random name, points the database at
the copy, then deletes the old file. Safe to run more than once.

    python manage.py randomize_media_names --dry-run     # only show what would happen
    python manage.py randomize_media_names               # do it
    python manage.py randomize_media_names --keep-old    # do it but do not delete the old files

Back up the database first. Works the same for local storage and Supabase.
"""

import os
import re
import uuid

from django.core.management.base import BaseCommand

from gallery.models import GalleryMedia

_ALREADY_RANDOM = re.compile(r"^[0-9a-f]{32}$")
_FIELDS = ("file", "thumbnail")


class Command(BaseCommand):
    help = "Rename existing gallery files to random, unguessable names."

    def add_arguments(self, parser):
        parser.add_argument("--dry-run", action="store_true", help="Show what would change; change nothing.")
        parser.add_argument("--keep-old", action="store_true", help="Do not delete the old files after copying.")

    def handle(self, *args, **options):
        dry_run = options["dry_run"]
        keep_old = options["keep_old"]
        changed = skipped = failed = 0

        for media in GalleryMedia.objects.all().iterator():
            for field_name in _FIELDS:
                field = getattr(media, field_name)

                if not field or not field.name:
                    continue

                directory, base = os.path.split(field.name)
                stem, extension = os.path.splitext(base)

                if _ALREADY_RANDOM.match(stem):
                    skipped += 1
                    continue

                new_name = f"{directory}/{uuid.uuid4().hex}{extension.lower()}".lstrip("/")

                if dry_run:
                    self.stdout.write(f"[dry run] media {media.pk} {field_name}: {field.name} -> {new_name}")
                    changed += 1
                    continue

                try:
                    old_name = field.name
                    storage = field.storage

                    with storage.open(old_name, "rb") as source:
                        saved_name = storage.save(new_name, source)

                    GalleryMedia.objects.filter(pk=media.pk).update(**{field_name: saved_name})

                    if not keep_old:
                        storage.delete(old_name)

                    changed += 1
                    self.stdout.write(f"media {media.pk} {field_name}: renamed")
                except Exception as error:  # keep going; report at the end
                    failed += 1
                    self.stderr.write(f"media {media.pk} {field_name}: FAILED ({error})")

        verb = "would rename" if dry_run else "renamed"
        self.stdout.write(self.style.SUCCESS(f"Done: {verb} {changed}, already random {skipped}, failed {failed}."))