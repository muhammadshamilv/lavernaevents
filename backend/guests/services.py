import csv
import io

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.validators import validate_email
from django.db import IntegrityError, transaction
from django.db.models import Max
from memberships.utils import LimitExceededError, check_guest_limit

from .models import Guest, GuestCategory
from .phone import INVALID_MOBILE_MESSAGE, is_valid_guest_mobile, normalize_guest_mobile

DUPLICATE_GUEST_MESSAGE = "This mobile number is already on the guest list for this event."
DUPLICATE_CATEGORY_MESSAGE = "A category with this name already exists for this event."

MAX_CSV_BYTES = 2 * 1024 * 1024
MAX_CSV_ROWS = 1000
MAX_CATEGORIES_PER_EVENT = 30


class GuestError(Exception):
    """Raised when a guest action cannot be completed."""

    def __init__(self, message: str, code: str = "guest_error"):
        self.message = message
        self.code = code
        super().__init__(message)


def get_event_guest_count(event) -> int:
    """Return the number of guests currently on this event."""

    return Guest.objects.filter(event=event).count()


def _lock_organizer(organizer):
    """Row-lock the organizer so parallel requests can't both pass the
    plan's guest-limit check."""

    return get_user_model().objects.select_for_update().get(pk=organizer.pk)


# --------------------------------------------------
# Single guest
# --------------------------------------------------

def create_guest(event, organizer, validated_data: dict) -> Guest:
    """Create a single guest, enforcing the organizer's plan guest limit."""

    try:
        with transaction.atomic():
            locked_organizer = _lock_organizer(organizer)

            try:
                check_guest_limit(locked_organizer, get_event_guest_count(event))

            except LimitExceededError as error:
                raise GuestError(error.message, code=error.code)

            return Guest.objects.create(event=event, **validated_data)

    except IntegrityError:
        raise GuestError(DUPLICATE_GUEST_MESSAGE, code="duplicate_guest")


def update_guest(guest: Guest, validated_data: dict) -> Guest:
    """Apply partial updates to an existing guest."""

    try:
        with transaction.atomic():
            for field, value in validated_data.items():
                setattr(guest, field, value)

            guest.save()

    except IntegrityError:
        raise GuestError(DUPLICATE_GUEST_MESSAGE, code="duplicate_guest")

    return guest


def delete_guest(guest: Guest) -> None:
    """Permanently delete a guest."""

    guest.delete()


# --------------------------------------------------
# Row cleaning shared by CSV import
# --------------------------------------------------

def clean_guest_row(data: dict) -> tuple[dict | None, str]:
    """Validate one raw row (CSV). Returns (cleaned, "") or (None, reason)."""

    name = (data.get("name") or "").strip()
    raw_mobile = (data.get("mobile_number") or "").strip()

    if not name or not raw_mobile:
        return None, "Missing name or mobile_number."

    if len(name) > 150:
        return None, "Name is longer than 150 characters."

    mobile_number = normalize_guest_mobile(raw_mobile)

    if not is_valid_guest_mobile(mobile_number):
        return None, f"Invalid mobile number ({raw_mobile}). {INVALID_MOBILE_MESSAGE}"

    email = (data.get("email") or "").strip().lower()

    if email:
        try:
            validate_email(email)

        except DjangoValidationError:
            return None, f"Invalid email address ({email})."

    family_raw = (data.get("family_member_count") or "").strip()
    family_member_count = 3

    if family_raw:
        try:
            family_member_count = int(family_raw)

        except ValueError:
            return None, "family_member_count must be a whole number."

        if not 0 <= family_member_count <= 50:
            return None, "family_member_count must be between 0 and 50."

    return (
        {
            "name": name,
            "mobile_number": mobile_number,
            "email": email,
            "family_member_count": family_member_count,
            "notes": (data.get("notes") or "").strip()[:255],
        },
        "",
    )


# Accepted CSV header spellings -> canonical column.
CSV_HEADER_ALIASES = {
    "name": "name",
    "guest_name": "name",
    "full_name": "name",
    "mobile_number": "mobile_number",
    "mobile": "mobile_number",
    "phone": "mobile_number",
    "phone_number": "mobile_number",
    "email": "email",
    "email_address": "email",
    "category": "category",
    "family_member_count": "family_member_count",
    "family_members": "family_member_count",
    "party_size": "family_member_count",
    "notes": "notes",
}


def _normalize_header(header: str) -> str:
    return (header or "").strip().lower().replace(" ", "_").replace("-", "_")


def import_guests_from_csv(event, organizer, csv_file, category: GuestCategory | None = None) -> dict:
    """Import guests from an uploaded CSV file.

    Columns (header spelling is forgiving): name + mobile_number are
    required; email, family_member_count, notes and category (a category
    NAME of this event - so an exported file can be re-imported) are
    optional. `category` (the chosen default) applies to rows without a
    known category column value.

    Returns {created_count, skipped_count, skipped_rows}. Stops (keeping
    earlier successes) once the plan's guest limit is reached.
    """

    if csv_file.size > MAX_CSV_BYTES:
        raise GuestError("The CSV file is too large (maximum 2 MB).", code="file_too_large")

    try:
        decoded = csv_file.read().decode("utf-8-sig")

    except UnicodeDecodeError:
        raise GuestError(
            "Could not read the CSV file. Please ensure it is UTF-8 encoded.",
            code="invalid_encoding",
        )

    reader = csv.DictReader(io.StringIO(decoded))

    header_map: dict[str, str] = {}

    for header in reader.fieldnames or []:
        canonical = CSV_HEADER_ALIASES.get(_normalize_header(header))

        if canonical and canonical not in header_map.values():
            header_map[header] = canonical

    if not {"name", "mobile_number"}.issubset(set(header_map.values())):
        raise GuestError(
            "CSV must contain at least 'name' and 'mobile_number' columns.",
            code="invalid_columns",
        )

    categories_by_name = {
        c.name.lower(): c for c in GuestCategory.objects.filter(event=event)
    }
    existing_numbers = set(
        Guest.objects.filter(event=event).values_list("mobile_number", flat=True)
    )

    created_count = 0
    skipped: list[dict] = []

    with transaction.atomic():
        locked_organizer = _lock_organizer(organizer)
        current_count = get_event_guest_count(event)

        for row_number, row in enumerate(reader, start=2):
            data = {
                canonical: (row.get(header) or "").strip()
                for header, canonical in header_map.items()
            }

            if not any(data.values()):
                continue  # completely blank line

            if row_number - 1 > MAX_CSV_ROWS:
                skipped.append(
                    {
                        "row": row_number,
                        "reason": f"Only the first {MAX_CSV_ROWS} rows are imported at a time.",
                    }
                )
                break

            cleaned, reason = clean_guest_row(data)

            if cleaned is None:
                skipped.append({"row": row_number, "reason": reason})
                continue

            if cleaned["mobile_number"] in existing_numbers:
                skipped.append(
                    {"row": row_number, "reason": "Duplicate mobile number for this event."}
                )
                continue

            try:
                check_guest_limit(locked_organizer, current_count)

            except LimitExceededError as error:
                skipped.append({"row": row_number, "reason": error.message})
                break

            row_category = categories_by_name.get(data.get("category", "").lower()) or category

            try:
                with transaction.atomic():
                    Guest.objects.create(event=event, category=row_category, **cleaned)

            except IntegrityError:
                skipped.append(
                    {"row": row_number, "reason": "Duplicate mobile number for this event."}
                )
                continue

            existing_numbers.add(cleaned["mobile_number"])
            current_count += 1
            created_count += 1

    return {
        "created_count": created_count,
        "skipped_count": len(skipped),
        "skipped_rows": skipped,
    }


def _csv_safe(value) -> str:
    """Stop spreadsheet apps treating a cell as a formula (CSV injection)."""

    text = "" if value is None else str(value)

    if text and text[0] in ("=", "+", "-", "@", "\t", "\r"):
        return "'" + text

    return text


def export_guests_to_csv(event) -> str:
    """Return a CSV string of all guests on the given event.

    The first columns match what import accepts, so an export can be
    re-imported (e.g. into another event).
    """

    output = io.StringIO()
    writer = csv.writer(output)

    writer.writerow(
        [
            "name",
            "mobile_number",
            "email",
            "category",
            "family_member_count",
            "notes",
            "invitation_status",
            "response_status",
        ]
    )

    guests = Guest.objects.filter(event=event).select_related("category").order_by("name")

    for guest in guests:
        writer.writerow(
            [
                _csv_safe(guest.name),
                guest.mobile_number,
                _csv_safe(guest.email),
                _csv_safe(guest.category.name if guest.category else ""),
                guest.family_member_count,
                _csv_safe(guest.notes),
                guest.invitation_status,
                guest.response_status,
            ]
        )

    return output.getvalue()


# --------------------------------------------------
# Guest Categories
# --------------------------------------------------

DEFAULT_GUEST_CATEGORIES = ["Family", "Friends", "Relatives", "Special Guest", "VIP"]


def seed_default_categories(event) -> list[GuestCategory]:
    """Create the default guest categories for a newly created event.

    Idempotent: skips any name that already exists for this event.
    """

    existing_names = set(
        GuestCategory.objects.filter(event=event).values_list("name", flat=True)
    )

    to_create = [
        GuestCategory(event=event, name=name, display_order=index)
        for index, name in enumerate(DEFAULT_GUEST_CATEGORIES)
        if name not in existing_names
    ]

    if to_create:
        GuestCategory.objects.bulk_create(to_create)

    return list(GuestCategory.objects.filter(event=event).order_by("display_order"))


def _category_name_taken(event, name: str, exclude_pk=None) -> bool:
    queryset = GuestCategory.objects.filter(event=event, name__iexact=name)

    if exclude_pk is not None:
        queryset = queryset.exclude(pk=exclude_pk)

    return queryset.exists()


def create_category(event, validated_data: dict) -> GuestCategory:
    """Create a new organizer-defined category (appended after existing ones)."""

    name = validated_data["name"]

    if GuestCategory.objects.filter(event=event).count() >= MAX_CATEGORIES_PER_EVENT:
        raise GuestError(
            f"An event can have at most {MAX_CATEGORIES_PER_EVENT} categories.",
            code="category_limit",
        )

    if _category_name_taken(event, name):
        raise GuestError(DUPLICATE_CATEGORY_MESSAGE, code="duplicate_category")

    data = dict(validated_data)

    if "display_order" not in data:
        highest = GuestCategory.objects.filter(event=event).aggregate(top=Max("display_order"))["top"]
        data["display_order"] = (highest if highest is not None else -1) + 1

    try:
        with transaction.atomic():
            return GuestCategory.objects.create(event=event, **data)

    except IntegrityError:
        raise GuestError(DUPLICATE_CATEGORY_MESSAGE, code="duplicate_category")


def update_category(category: GuestCategory, validated_data: dict) -> GuestCategory:
    """Apply partial updates (rename / reorder) to an existing category."""

    name = validated_data.get("name")

    if name is not None and _category_name_taken(category.event, name, exclude_pk=category.pk):
        raise GuestError(DUPLICATE_CATEGORY_MESSAGE, code="duplicate_category")

    try:
        with transaction.atomic():
            for field, value in validated_data.items():
                setattr(category, field, value)

            category.save()

    except IntegrityError:
        raise GuestError(DUPLICATE_CATEGORY_MESSAGE, code="duplicate_category")

    return category


def delete_category(category: GuestCategory) -> None:
    """Delete a category. Guests in it become uncategorized (SET_NULL)."""

    category.delete()


# --------------------------------------------------
# Contact Import
# --------------------------------------------------

def bulk_import_guests(event, organizer, rows: list[dict]) -> dict:
    """Create many guests at once from a reviewed Contact Picker batch.

    `rows` is already-validated data from ContactImportRowSerializer.
    Same result shape / behaviour as the CSV importer: duplicates are
    skipped, the plan's guest limit stops the run (keeping earlier
    successes).
    """

    existing_numbers = set(
        Guest.objects.filter(event=event).values_list("mobile_number", flat=True)
    )

    created_count = 0
    skipped: list[dict] = []

    with transaction.atomic():
        locked_organizer = _lock_organizer(organizer)
        current_count = get_event_guest_count(event)

        for index, row in enumerate(rows):
            number = row["mobile_number"]

            if number in existing_numbers:
                skipped.append(
                    {
                        "row": index + 1,
                        "reason": f"Duplicate mobile number ({number}) for this event.",
                    }
                )
                continue

            try:
                check_guest_limit(locked_organizer, current_count)

            except LimitExceededError as error:
                skipped.append({"row": index + 1, "reason": error.message})
                break

            try:
                with transaction.atomic():
                    Guest.objects.create(
                        event=event,
                        category=row.get("category"),
                        name=row["name"],
                        mobile_number=number,
                        email=row.get("email", ""),
                        family_member_count=row.get("family_member_count", 3),
                    )

            except IntegrityError:
                skipped.append(
                    {
                        "row": index + 1,
                        "reason": f"Duplicate mobile number ({number}) for this event.",
                    }
                )
                continue

            existing_numbers.add(number)
            current_count += 1
            created_count += 1

    return {
        "created_count": created_count,
        "skipped_count": len(skipped),
        "skipped_rows": skipped,
    }
