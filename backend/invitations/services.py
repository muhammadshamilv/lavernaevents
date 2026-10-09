import base64
import io
import logging
import re
import secrets
from datetime import datetime
from pathlib import Path

from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile
from django.db import IntegrityError, transaction
from django.db.models import Q
from memberships.models import OrganizerTemplateLibrary
from memberships.services import add_template_to_library
from memberships.utils import LimitExceededError, check_template_limit
from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageStat

from .models import ActiveFilledTemplate, Invitation, InvitationTemplate


logger = logging.getLogger(__name__)


class InvitationError(Exception):
    """Raised when an invitation action cannot be completed."""

    def __init__(self, message: str, code: str = "invitation_error"):
        self.message = message
        self.code = code
        super().__init__(message)


def generate_response_token() -> str:
    """Generate a URL-safe, hard-to-guess token for the guest response link."""

    return secrets.token_urlsafe(24)


_PLACEHOLDER = re.compile(r"\{(\w+)\}")

# Longest edge (px) a template background is rendered at. Keeps memory and
# render time bounded however large the uploaded picture is.
MAX_RENDER_EDGE = 2400


def substitute_placeholders(text: str, context: dict) -> str:
    """Replace {name} tokens with values from `context`.

    A plain regex substitution - NOT str.format - so template text can never
    reach into Python objects (e.g. "{event_name.__class__}"), a stray brace
    or "{0}" can never crash a render, and an unknown {token} is left exactly
    as typed. Values are inserted as-is and never re-scanned.
    """

    def _swap(match):
        key = match.group(1)

        if key in context and context[key] is not None:
            return str(context[key])

        return match.group(0)

    return _PLACEHOLDER.sub(_swap, text or "")


def visible_templates_for(organizer):
    """Active templates this organizer may use: platform templates plus
    their own uploads. Other organizers' uploads are never visible."""

    return InvitationTemplate.objects.filter(
        Q(owner__isnull=True) | Q(owner=organizer),
        is_active=True,
    )


# ---------------------------------------------------------------------------
# Event time helpers (start - end range)
# ---------------------------------------------------------------------------

def _clock_text(value) -> str:
    """7:00 PM style text (no leading zero) for a time object."""

    return value.strftime("%I:%M %p").lstrip("0")


def format_time_range(start, end=None) -> str:
    """"7:00 PM" or, when an end time is known, "7:00 PM - 10:00 PM"."""

    if start is None:
        return ""

    if end is None:
        return _clock_text(start)

    return f"{_clock_text(start)} - {_clock_text(end)}"


def format_event_time(event) -> str:
    """The event's time as the guest should read it (range if it has an end)."""

    return format_time_range(event.event_time, getattr(event, "event_end_time", None))


def parse_clock_input(value):
    """Parse "HH:MM" (what <input type=time> sends) into a time, or None."""

    if not value:
        return None

    for pattern in ("%H:%M", "%H:%M:%S", "%I:%M %p"):
        try:
            return datetime.strptime(str(value).strip(), pattern).time()
        except ValueError:
            continue

    return None


# Style choices the organizer makes on the fill form. They are stored
# inside ActiveFilledTemplate.standard_values (a JSON column), so no
# database change is needed for them.
STYLE_KEYS = ("text_color", "font_style", "time_from", "time_to")

FONT_STYLES = {
    # key: (title font file, title weight, body font file, body weight)
    "elegant": ("PlayfairDisplay.ttf", 700, "PlayfairDisplay.ttf", 400),
    "script": ("GreatVibes-Regular.ttf", None, "Montserrat.ttf", 400),
    "modern": ("Montserrat.ttf", 700, "Montserrat.ttf", 400),
    "playful": ("DancingScript.ttf", 700, "Montserrat.ttf", 400),
}

DEFAULT_FONT_STYLE = "elegant"

_HEX_COLOR = re.compile(r"^#[0-9a-fA-F]{6}$")


def build_placeholder_context(event, guest) -> dict:
    """Build the fixed standard placeholder dict for a given event+guest.

    This remains the single source of truth for what the standard fields
    (event_name, event_date, etc.) default to when an organizer starts
    filling a template on the Templates page - the fill-in form
    pre-populates from this, but the organizer can then override any
    value before confirming (see fill_active_template).

    When guest is None (the fill form's defaults) a few form-only keys
    are added too: the raw From / To times and the style defaults.
    """

    context = {
        "guest_name": guest.name if guest is not None else "{guest_name}",
        "event_name": event.name,
        "event_date": event.event_date.strftime("%d %B %Y"),
        "event_time": format_event_time(event),
        "venue_name": event.venue_name or "the venue",
        "venue_address": event.address or "",
        "host_name": event.host_name or event.organizer.full_name,
    }

    if guest is None:
        end = getattr(event, "event_end_time", None)
        context["time_from"] = event.event_time.strftime("%H:%M")
        context["time_to"] = end.strftime("%H:%M") if end else ""
        context["text_color"] = ""
        context["font_style"] = DEFAULT_FONT_STYLE

    return context


def render_template_text(template: InvitationTemplate, event, guest) -> str:
    """Substitute the standard placeholders into a template's body_text.

    Kept for the legacy per-guest preview path. The main send flow uses
    render_active_template_for_guest instead, which substitutes from an
    ActiveFilledTemplate's confirmed values, not live event data.
    """

    context = build_placeholder_context(event, guest)

    allowed = set(_all_placeholder_keys(template))
    unknown = _extract_used_placeholders(template.body_text) - allowed

    if unknown:
        raise InvitationError(
            f"This template uses an unknown placeholder: "
            f"{', '.join('{' + p + '}' for p in sorted(unknown))}. "
            f"Supported placeholders: {', '.join(InvitationTemplate.PLACEHOLDER_FIELDS)}.",
            code="invalid_placeholder",
        )

    return substitute_placeholders(template.body_text, context)


def preview_template(template: InvitationTemplate, event, guest) -> dict:
    """Return a preview of what this template will look like for a specific
    guest+event, WITHOUT generating or persisting an Invitation."""

    result = {
        "channel": template.channel,
        "rendered_text": "",
        "has_image": bool(template.background_image),
    }

    if template.body_text:
        result["rendered_text"] = render_template_text(template, event, guest)

    return result


# ---------------------------------------------------------------------------
# Invitation image rendering
# ---------------------------------------------------------------------------

# Fonts committed with the project (backend/invitations/fonts/) are tried
# first, so rendering looks the same on any server - including hosts that
# have no system fonts installed.
_FONT_DIR = Path(__file__).resolve().parent / "fonts"

_FALLBACK_BOLD = [
    str(_FONT_DIR / "DejaVuSans-Bold.ttf"),
    "DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "arialbd.ttf",
]

_FALLBACK_REGULAR = [
    str(_FONT_DIR / "DejaVuSans.ttf"),
    "DejaVuSans.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "arial.ttf",
]


def _load_font(file_name: str | None, weight: int | None, size: int, bold_fallback: bool = False):
    """Load a bundled TrueType font (setting its weight if it is a
    variable font), falling back to DejaVu and then Pillow's default."""

    candidates = []

    if file_name:
        font_path = _FONT_DIR / file_name

        if not font_path.exists():
            logger.warning(
                "Invitation font %s is missing from %s - the card falls back to "
                "DejaVu. Download the fonts into that folder.",
                file_name,
                _FONT_DIR,
            )

        candidates.append(str(font_path))

    candidates += _FALLBACK_BOLD if bold_fallback else _FALLBACK_REGULAR

    for name in candidates:
        try:
            font = ImageFont.truetype(name, size)
        except OSError:
            continue

        if weight is not None:
            try:
                font.set_variation_by_axes([weight])
            except Exception:
                pass

        return font

    try:
        return ImageFont.load_default(size=size)
    except TypeError:
        return ImageFont.load_default()


def _font_set(style: str, width: int) -> dict:
    """The title / body / label fonts for one font style, sized to the image."""

    title_file, title_weight, body_file, body_weight = FONT_STYLES.get(
        style, FONT_STYLES[DEFAULT_FONT_STYLE]
    )

    # Script faces look small at the same point size.
    title_scale = 1.35 if style == "script" else 1.15 if style == "playful" else 1.0

    return {
        "title": _load_font(title_file, title_weight, max(22, int(width * 0.068 * title_scale)), True),
        "name": _load_font(body_file, 600 if body_weight else None, max(16, int(width * 0.040)), True),
        "body": _load_font(body_file, body_weight, max(14, int(width * 0.034))),
        "label": _load_font("Montserrat.ttf", 600, max(10, int(width * 0.022)), True),
    }


def _wrap_text(draw, text: str, font, max_width: int) -> list[str]:
    """Word-wrap `text` to `max_width` pixels. Blank lines are kept."""

    lines: list[str] = []

    for paragraph in text.split("\n"):
        words = paragraph.split()

        if not words:
            lines.append("")
            continue

        current = words[0]

        for word in words[1:]:
            trial = f"{current} {word}"

            if draw.textlength(trial, font=font) <= max_width:
                current = trial
            else:
                lines.append(current)
                current = word

        lines.append(current)

    return lines


def _line_height(draw, font, factor: float = 1.4) -> int:
    bbox = draw.textbbox((0, 0), "Ag", font=font)
    return max(1, int((bbox[3] - bbox[1]) * factor))


def _spaced_width(draw, text: str, font, spacing: float) -> float:
    return sum(draw.textlength(ch, font=font) + spacing for ch in text) - spacing


def _hex_to_rgb(value: str) -> tuple[int, int, int]:
    value = value.lstrip("#")
    return int(value[0:2], 16), int(value[2:4], 16), int(value[4:6], 16)


def _open_background(template: InvitationTemplate) -> Image.Image:
    """Open the template's background image as an RGB Pillow image.

    Goes through Django's storage layer (not a filesystem path) so it
    works for local disk and for cloud storage alike.
    """

    with template.background_image.open("rb") as background_file:
        data = background_file.read()

    image = Image.open(io.BytesIO(data))
    # Reduce very large pictures before decoding fully to RGB.
    image.thumbnail((MAX_RENDER_EDGE, MAX_RENDER_EDGE), Image.LANCZOS)

    return image.convert("RGB")


def _pick_text_color(background: Image.Image, chosen: str | None) -> tuple[int, int, int]:
    """The organizer's chosen font colour, or a dark/light colour picked
    from how bright the middle of the background is."""

    if chosen and _HEX_COLOR.match(chosen):
        return _hex_to_rgb(chosen)

    width, height = background.size
    middle = background.crop(
        (int(width * 0.18), int(height * 0.30), int(width * 0.82), int(height * 0.75))
    ).convert("L")
    brightness = ImageStat.Stat(middle).mean[0]

    return (43, 43, 43) if brightness >= 130 else (255, 255, 255)


def _compose_invitation_image(
    template: InvitationTemplate,
    context: dict,
    custom_pairs: list[tuple[str, str]],
    max_width: int | None = None,
) -> ContentFile:
    """Draw the invitation's text onto the template's background image.

    The organizer's font colour and font style (context["text_color"],
    context["font_style"]) are honoured. Without body_text a designed
    default layout is drawn: "Hi <guest name>,", "YOU ARE INVITED", big event
    title, a divider and then Date / Time / Venue blocks (plus the
    template's custom fields). With body_text, that text (placeholders
    filled) is drawn instead, in the chosen font and colour.
    """

    background = _open_background(template)

    if max_width and background.width > max_width:
        ratio = max_width / background.width
        background = background.resize(
            (max_width, int(background.height * ratio)),
            Image.LANCZOS,
        )

    width, height = background.size
    draw = ImageDraw.Draw(background)

    style = context.get("font_style") or DEFAULT_FONT_STYLE
    fonts = _font_set(style, width)
    max_text_width = int(width * 0.70)
    color = _pick_text_color(background, context.get("text_color"))
    soft = color

    # rows: (kind, text, font, space_after)
    rows: list[tuple[str, str, object, int]] = []

    body_lh = _line_height(draw, fonts["body"])

    if template.body_text:
        rendered = substitute_placeholders(template.body_text, context)

        for line in _wrap_text(draw, rendered, fonts["body"], max_text_width):
            rows.append(("text", line, fonts["body"], 0 if line else int(body_lh * 0.4)))

    else:
        # The greeting sits at the very top. The name is the guest this
        # copy of the card is being made for, so every guest gets their own
        # "Hi <name>," when the invitation is sent.
        guest_name = str(context.get("guest_name", "")).strip()

        if guest_name:
            for line in _wrap_text(draw, f"Hi {guest_name},", fonts["name"], max_text_width):
                rows.append(("text", line, fonts["name"], int(height * 0.012)))

        rows.append(("label", "YOU ARE INVITED", fonts["label"], int(height * 0.022)))

        title = str(context.get("event_name", ""))
        title_font = fonts["title"]

        lines = _wrap_text(draw, title, title_font, max_text_width)

        # Long names: shrink the title until it fits in 3 lines.
        size = title_font.size if hasattr(title_font, "size") else 40

        while len(lines) > 3 and size > 18:
            size = int(size * 0.88)
            title_file, title_weight, _bf, _bw = FONT_STYLES.get(style, FONT_STYLES[DEFAULT_FONT_STYLE])
            title_font = _load_font(title_file, title_weight, size, True)
            lines = _wrap_text(draw, title, title_font, max_text_width)

        for index, line in enumerate(lines):
            rows.append(("title", line, title_font, int(height * 0.012) if index == len(lines) - 1 else 0))

        rows.append(("divider", "", fonts["body"], int(height * 0.022)))

        detail_blocks = [
            ("DATE", str(context.get("event_date", ""))),
            ("TIME", str(context.get("event_time", ""))),
            ("VENUE", str(context.get("venue_name", ""))),
        ]

        detail_blocks += [(label.upper(), value) for label, value in custom_pairs if value]

        for label, value in detail_blocks:
            if not value:
                continue

            rows.append(("label", label, fonts["label"], int(height * 0.004)))

            value_lines = _wrap_text(draw, value, fonts["name"], max_text_width)

            for index, line in enumerate(value_lines):
                rows.append(("text", line, fonts["name"], int(height * 0.016) if index == len(value_lines) - 1 else 0))

    def row_height(kind, text, font, after):
        if kind == "divider":
            return int(height * 0.012) + after

        if not text:
            return after

        factor = 1.25 if kind in ("title", "label") else 1.4
        return _line_height(draw, font, factor) + after

    heights = [row_height(*row) for row in rows]
    total_height = sum(heights)
    y = max(int(height * 0.16), int((height - total_height) / 2))

    # Soft shadow layer so text stays readable on busy backgrounds.
    shadow_layer = Image.new("RGBA", background.size, (0, 0, 0, 0))
    shadow_draw = ImageDraw.Draw(shadow_layer)
    shadow_color = (0, 0, 0, 90) if sum(color) > 380 else (255, 255, 255, 110)

    placements = []

    for (kind, text, font, after), row_h in zip(rows, heights):
        if kind == "divider":
            line_y = y + int(height * 0.006)
            half = int(width * 0.09)
            placements.append(("divider", (width // 2 - half, line_y, width // 2 + half, line_y)))
        elif text:
            if kind == "label":
                spacing = max(1.5, font.size * 0.18) if hasattr(font, "size") else 2
                text_width = _spaced_width(draw, text, font, spacing)
                placements.append(("label", ((width - text_width) / 2, y, text, font, spacing)))
            else:
                text_width = draw.textlength(text, font=font)
                placements.append(("text", ((width - text_width) / 2, y, text, font, kind)))

        y += row_h

    offset = max(1, int(width * 0.0016))

    for placement in placements:
        if placement[0] == "divider":
            shadow_draw.line(placement[1], fill=shadow_color, width=max(2, int(width * 0.003)))
        elif placement[0] == "label":
            x, ty, text, font, spacing = placement[1]
            cx = x
            for ch in text:
                shadow_draw.text((cx + offset, ty + offset), ch, font=font, fill=shadow_color)
                cx += draw.textlength(ch, font=font) + spacing
        else:
            x, ty, text, font, _kind = placement[1]
            shadow_draw.text((x + offset, ty + offset), text, font=font, fill=shadow_color)

    shadow_layer = shadow_layer.filter(ImageFilter.GaussianBlur(max(1, int(width * 0.002))))
    background = Image.alpha_composite(background.convert("RGBA"), shadow_layer).convert("RGB")
    draw = ImageDraw.Draw(background)

    for placement in placements:
        if placement[0] == "divider":
            draw.line(placement[1], fill=color, width=max(2, int(width * 0.003)))
        elif placement[0] == "label":
            x, ty, text, font, spacing = placement[1]
            cx = x
            for ch in text:
                draw.text((cx, ty), ch, font=font, fill=soft)
                cx += draw.textlength(ch, font=font) + spacing
        else:
            x, ty, text, font, kind = placement[1]
            draw.text((x, ty), text, font=font, fill=color)

    buffer = io.BytesIO()
    background.save(buffer, format="JPEG", quality=92)
    buffer.seek(0)

    return ContentFile(buffer.read())


def _render_invitation_image(template: InvitationTemplate, event, guest, extra_context: dict | None = None) -> ContentFile:
    """Render an invitation image from live event data (legacy per-guest
    path). The main send flow uses render_active_template_image."""

    context = build_placeholder_context(event, guest)

    if extra_context:
        context = {**context, **extra_context}

    return _compose_invitation_image(template, context, custom_pairs=[])


def render_active_template_image(active: ActiveFilledTemplate, guest_name: str, max_width: int | None = None) -> ContentFile:
    """Render the organizer's CONFIRMED filled values onto the template's
    background image, for one guest name (or a sample name for previews)."""

    template = active.template

    context = {**active.standard_values, **active.custom_values, "guest_name": guest_name}

    custom_pairs = [
        (field.label, str(active.custom_values.get(field.field_key, "")))
        for field in template.custom_fields.order_by("display_order", "id")
    ]

    return _compose_invitation_image(template, context, custom_pairs, max_width=max_width)


def build_active_template_preview(active: ActiveFilledTemplate, guest_name: str = "Guest Name") -> dict:
    """What the Templates page shows after the organizer confirms the
    form: the card with their text drawn on it (if the template has a
    background image) and the rendered message text (if it has any)."""

    template = active.template

    preview_text = ""

    if active.rendered_preview_text:
        preview_text = active.rendered_preview_text.replace("{guest_name}", guest_name)

    image = None

    if template.background_image:
        try:
            content = render_active_template_image(active, guest_name, max_width=720)
            image = "data:image/jpeg;base64," + base64.b64encode(content.read()).decode("ascii")
        except Exception:
            logger.exception("Could not render the preview card for template %s", template.id)
            image = None

    return {
        "template_id": template.id,
        "template_name": template.name,
        "has_image": bool(template.background_image),
        "image": image,
        "text": preview_text,
    }


def get_or_create_invitation(event, guest, template_id, organizer) -> Invitation:
    """Get the existing invitation for this guest+template, or generate a new one.

    Legacy path, kept for compatibility. The main send flow
    (send_active_template_to_guest in notifications) does not call this.
    """

    template = visible_templates_for(organizer).filter(pk=template_id).first()

    if template is None:
        raise InvitationError(
            "No active invitation template found with this ID.",
            code="template_not_found",
        )

    if template.channel in (
        InvitationTemplate.Channel.WHATSAPP,
        InvitationTemplate.Channel.SMS,
        InvitationTemplate.Channel.VOICE_CALL,
    ) and not template.body_text:
        raise InvitationError(
            "This template has no message content configured. Please contact support.",
            code="template_missing_body",
        )

    try:
        check_template_limit(organizer, template)

    except LimitExceededError as error:
        raise InvitationError(error.message, code=error.code)

    add_template_to_library(organizer, template)

    existing = Invitation.objects.filter(guest=guest, template=template).first()

    if existing is not None:
        return existing

    rendered_text = ""

    if template.body_text:
        rendered_text = render_template_text(template, event, guest)

    try:
        invitation = Invitation.objects.create(
            event=event,
            guest=guest,
            template=template,
            response_token=generate_response_token(),
            rendered_text=rendered_text,
        )

    except IntegrityError:
        invitation = Invitation.objects.get(guest=guest, template=template)
        return invitation

    if template.background_image:
        try:
            image_content = _render_invitation_image(template, event, guest)
            invitation.image_file.save(
                f"invitation_{invitation.pk}.jpg",
                image_content,
                save=True,
            )

        except Exception:
            invitation.status = Invitation.Status.FAILED
            invitation.save(update_fields=["status", "updated_at"])

            raise InvitationError(
                "Invitation record created, but image rendering failed. "
                "Please contact support.",
                code="render_failed",
            )

    return invitation


def upload_custom_template(organizer, validated_data: dict) -> InvitationTemplate:
    """Create a new custom InvitationTemplate owned by this organizer.

    validated_data may include custom_fields (a list of {field_key,
    label} dicts) - these are created as TemplateCustomField rows right
    after the template itself. The organizer row is locked while the
    plan's template limit is checked and the template + its library slot
    are created, so two simultaneous uploads cannot exceed the limit.
    """

    from .models import TemplateCustomField

    draft_template = InvitationTemplate(
        name=validated_data["name"],
        description=validated_data.get("description", ""),
        channel=validated_data["channel"],
        body_text=validated_data.get("body_text", ""),
        owner=organizer,
        is_custom=True,
    )

    with transaction.atomic():
        get_user_model().objects.select_for_update().get(pk=organizer.pk)

        try:
            check_template_limit(organizer, draft_template)

        except LimitExceededError as error:
            raise InvitationError(error.message, code=error.code)

        template = InvitationTemplate.objects.create(
            name=validated_data["name"],
            description=validated_data.get("description", ""),
            channel=validated_data["channel"],
            body_text=validated_data.get("body_text", ""),
            preview_image=validated_data.get("preview_image"),
            background_image=validated_data.get("background_image"),
            owner=organizer,
            is_custom=True,
            is_active=True,
        )

        TemplateCustomField.objects.bulk_create(
            [
                TemplateCustomField(
                    template=template,
                    field_key=field["field_key"],
                    label=field["label"],
                    display_order=index,
                )
                for index, field in enumerate(validated_data.get("custom_fields", []))
            ]
        )

        add_template_to_library(organizer, template)

    return template


def _delete_stored_file(file_field) -> None:
    """Best-effort removal of a stored image (never breaks a request)."""

    if not file_field:
        return

    try:
        file_field.storage.delete(file_field.name)

    except Exception:  # noqa: BLE001 - storage errors must not fail the API call
        logger.warning("Could not delete stored file %s", file_field.name, exc_info=True)


def delete_custom_template(organizer, template_id: int) -> str:
    """Remove one of the organizer's OWN uploaded templates.

    * It disappears from their library, which frees a template slot.
    * If it is their active filled template, that is deselected.
    * If invitations were already generated from it (Invitation.template is
      PROTECT) the row is kept but hidden (is_active=False) so those records
      stay valid; otherwise the template and its images are deleted.

    Returns "deleted" or "deactivated". Platform templates and other
    organizers' templates are reported as not found.
    """

    template = InvitationTemplate.objects.filter(
        pk=template_id,
        owner=organizer,
        is_custom=True,
    ).first()

    if template is None:
        raise InvitationError(
            "No custom template found with this ID.",
            code="template_not_found",
        )

    preview_image = template.preview_image
    background_image = template.background_image

    with transaction.atomic():
        ActiveFilledTemplate.objects.filter(organizer=organizer, template=template).delete()
        OrganizerTemplateLibrary.objects.filter(organizer=organizer, template=template).delete()

        if template.invitations.exists():
            template.is_active = False
            template.save(update_fields=["is_active", "updated_at"])
            return "deactivated"

        template.delete()

    _delete_stored_file(preview_image)
    _delete_stored_file(background_image)

    return "deleted"


# ---------------------------------------------------------------------------
# Select -> fill -> confirm -> (send from Guests page) -> deselect
# ---------------------------------------------------------------------------

def _all_placeholder_keys(template: InvitationTemplate) -> list[str]:
    """Return every placeholder key this template's body_text may use:
    the fixed standard set plus this template's own custom field keys."""

    return list(InvitationTemplate.PLACEHOLDER_FIELDS) + template.custom_field_keys()


def _extract_used_placeholders(body_text: str) -> set[str]:
    return set(re.findall(r"\{(\w+)\}", body_text))


def _clean_style_values(values: dict) -> dict:
    """Validate the style / time keys the fill form sends and, when a
    From time is given, build the guest-facing event_time text from the
    From - To range."""

    cleaned = dict(values)

    colour = str(cleaned.get("text_color", "") or "").strip()
    cleaned["text_color"] = colour if _HEX_COLOR.match(colour) else ""

    if cleaned.get("font_style") not in FONT_STYLES:
        cleaned["font_style"] = DEFAULT_FONT_STYLE

    start = parse_clock_input(cleaned.get("time_from"))
    end = parse_clock_input(cleaned.get("time_to"))

    cleaned["time_from"] = start.strftime("%H:%M") if start else ""
    cleaned["time_to"] = end.strftime("%H:%M") if (start and end) else ""

    if start:
        cleaned["event_time"] = format_time_range(start, end)

    return cleaned


def fill_active_template(organizer, template_id: int, event_id: int, standard_values: dict, custom_values: dict) -> ActiveFilledTemplate:
    """Select a template, tie it to an event, and confirm its filled-in
    content as the organizer's ONE active filled template.

    This REPLACES any previously active filled template for this
    organizer (OneToOneField). standard_values should normally start as
    the event's own auto-filled values but may be edited by the organizer
    before confirming; custom_values must cover every TemplateCustomField
    this template defines.

    Raises InvitationError on a missing/inactive template, a missing
    event not owned by the organizer, a missing required custom field
    value, or an unknown placeholder in body_text.
    """

    from events.models import Event

    template = visible_templates_for(organizer).filter(pk=template_id).first()

    if template is None:
        raise InvitationError(
            "No active invitation template found with this ID.",
            code="template_not_found",
        )

    event = Event.objects.filter(pk=event_id, organizer=organizer).first()

    if event is None:
        raise InvitationError(
            "No event found with this ID.",
            code="event_not_found",
        )

    if template.channel in (
        InvitationTemplate.Channel.WHATSAPP,
        InvitationTemplate.Channel.SMS,
        InvitationTemplate.Channel.VOICE_CALL,
    ) and not template.body_text:
        raise InvitationError(
            "This template has no message content configured. Please contact support.",
            code="template_missing_body",
        )

    try:
        check_template_limit(organizer, template)

    except LimitExceededError as error:
        raise InvitationError(error.message, code=error.code)

    required_custom_keys = set(template.custom_field_keys())
    provided_custom_keys = set(custom_values.keys())
    missing_custom = required_custom_keys - provided_custom_keys

    if missing_custom:
        raise InvitationError(
            f"Missing value(s) for: {', '.join(sorted(missing_custom))}.",
            code="missing_custom_field",
        )

    defaults = build_placeholder_context(event, guest=None)
    allowed_standard = set(InvitationTemplate.PLACEHOLDER_FIELDS) | set(STYLE_KEYS)
    merged_standard = {**defaults, **{k: v for k, v in standard_values.items() if k in allowed_standard}}
    merged_standard.pop("guest_name", None)

    merged_standard = _clean_style_values(merged_standard)

    full_context = {**merged_standard, **{k: custom_values[k] for k in required_custom_keys}}
    full_context["guest_name"] = "{guest_name}"

    rendered_preview_text = ""

    if template.body_text:
        used = _extract_used_placeholders(template.body_text)
        allowed = set(_all_placeholder_keys(template))
        unknown = used - allowed

        if unknown:
            raise InvitationError(
                f"This template uses an unknown placeholder: "
                f"{', '.join('{' + p + '}' for p in sorted(unknown))}. "
                f"Supported placeholders: {', '.join('{' + p + '}' for p in sorted(allowed))}.",
                code="invalid_placeholder",
            )

        rendered_preview_text = substitute_placeholders(template.body_text, full_context)

    with transaction.atomic():
        # Lock the organizer so the template-limit check and the library slot
        # it consumes cannot be raced by a second request.
        get_user_model().objects.select_for_update().get(pk=organizer.pk)

        try:
            check_template_limit(organizer, template)

        except LimitExceededError as error:
            raise InvitationError(error.message, code=error.code)

        add_template_to_library(organizer, template)

        active, _created = ActiveFilledTemplate.objects.update_or_create(
            organizer=organizer,
            defaults={
                "template": template,
                "event": event,
                "standard_values": merged_standard,
                "custom_values": {k: custom_values[k] for k in required_custom_keys},
                "rendered_preview_text": rendered_preview_text,
            },
        )

    return active


def get_active_filled_template(organizer) -> ActiveFilledTemplate | None:
    """Return the organizer's current active filled template, or None."""

    return ActiveFilledTemplate.objects.filter(organizer=organizer).select_related("template", "event").first()


def deselect_active_template(organizer) -> None:
    """Clear the organizer's active filled template, returning the
    Templates page to its background-only state."""

    ActiveFilledTemplate.objects.filter(organizer=organizer).delete()


def render_active_template_for_guest(active: ActiveFilledTemplate, guest) -> str:
    """Substitute ONLY the guest's name into the already-fixed
    rendered_preview_text.

    Everything else (event fields, custom fields) was locked in at
    fill-time. A plain token replace is used instead of str.format so a
    literal brace typed into a field (e.g. "Hall {A}") can never crash a
    send.
    """

    if not active.rendered_preview_text:
        return ""

    return active.rendered_preview_text.replace("{guest_name}", guest.name)


# ---------------------------------------------------------------------
# Reminder schedules
# ---------------------------------------------------------------------

def get_applicable_schedule(guest):
    """Return the ReminderSchedule that applies to this guest, or None.

    An individual guest-level schedule takes priority over that guest's
    category-level schedule. A guest with no category and no individual
    schedule gets None (no automatic reminder).
    """

    from .models import ReminderSchedule

    individual = ReminderSchedule.objects.filter(guest=guest, is_active=True).first()

    if individual is not None:
        return individual

    if guest.category_id is None:
        return None

    return ReminderSchedule.objects.filter(category=guest.category, is_active=True).first()


def upsert_reminder_schedule(event, delay_hours: int, category=None, guest=None):
    """Create or replace the single active schedule for this category/guest.

    Setting a new one deactivates any existing one for the same scope
    first, rather than erroring.
    """

    from .models import ReminderSchedule

    existing_qs = ReminderSchedule.objects.filter(is_active=True)
    existing_qs = existing_qs.filter(guest=guest) if guest is not None else existing_qs.filter(category=category)
    existing_qs.update(is_active=False)

    return ReminderSchedule.objects.create(
        event=event,
        category=category,
        guest=guest,
        delay_hours=delay_hours,
        is_active=True,
    )
