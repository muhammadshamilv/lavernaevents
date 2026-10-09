import re

from common.validators import ALLOWED_IMAGE_EXTENSIONS, validate_image_content, validate_image_file_size
from django.core.validators import FileExtensionValidator
from rest_framework import serializers

from .models import ActiveFilledTemplate, Invitation, InvitationSend, InvitationTemplate, TemplateCustomField, PendingWhatsAppReminder, ReminderSchedule


MAX_IMAGE_EDGE_PX = 4000
MAX_BODY_TEXT_CHARS = 1000
MAX_CUSTOM_FIELDS = 10
MAX_STANDARD_VALUE_CHARS = 300
MAX_CUSTOM_VALUE_CHARS = 200
MAX_FILL_KEYS = 40


def _library_template_ids(serializer) -> set[int]:
    """The ids of the templates already in the requesting organizer's
    library, fetched once per request (not once per template row)."""

    cached = serializer.context.get("_library_template_ids")

    if cached is not None:
        return cached

    request = serializer.context.get("request")
    ids: set[int] = set()

    if request is not None and request.user.is_authenticated:
        from memberships.models import OrganizerTemplateLibrary

        ids = set(
            OrganizerTemplateLibrary.objects.filter(organizer=request.user).values_list(
                "template_id", flat=True
            )
        )

    serializer.context["_library_template_ids"] = ids

    return ids


def _validate_image_dimensions(value):
    """Reject absurdly large pictures (memory / render-time protection)."""

    image = getattr(value, "image", None)

    if image is not None and max(image.size) > MAX_IMAGE_EDGE_PX:
        raise serializers.ValidationError(
            f"Image is too large. Maximum size is {MAX_IMAGE_EDGE_PX} x {MAX_IMAGE_EDGE_PX} pixels."
        )


class TemplateCustomFieldSerializer(serializers.ModelSerializer):
    """Serializer for a single custom field definition on a template."""

    class Meta:
        model = TemplateCustomField
        fields = ("id", "field_key", "label", "display_order")
        read_only_fields = fields


class InvitationTemplateSerializer(serializers.ModelSerializer):
    """Serializer for listing invitation templates available to organizers.

    Phase 20: added custom_fields (this template's own
    TemplateCustomField list) alongside placeholder_fields (the fixed
    standard set) - the frontend's fill-in form renders one input per
    standard field (auto-filled, editable) plus one per custom field
    (manual).
    """

    in_library = serializers.SerializerMethodField()
    placeholder_fields = serializers.SerializerMethodField()
    custom_fields = TemplateCustomFieldSerializer(many=True, read_only=True)

    class Meta:
        model = InvitationTemplate
        fields = (
            "id",
            "name",
            "description",
            "channel",
            "preview_image",
            "body_text",
            "placeholder_fields",
            "custom_fields",
            "is_custom",
            "display_order",
            "in_library",
        )
        read_only_fields = fields

    def get_in_library(self, obj: InvitationTemplate) -> bool:
        return obj.pk in _library_template_ids(self)

    def get_placeholder_fields(self, obj: InvitationTemplate) -> list[str]:
        return InvitationTemplate.PLACEHOLDER_FIELDS


class CustomFieldDefinitionInputSerializer(serializers.Serializer):
    """Input shape for one custom field definition when uploading a
    custom template."""

    field_key = serializers.SlugField(max_length=50)
    label = serializers.CharField(max_length=100)

    def validate_field_key(self, value: str) -> str:
        if value in InvitationTemplate.PLACEHOLDER_FIELDS:
            raise serializers.ValidationError(
                f"\"{value}\" is already a standard placeholder and cannot be used as a custom field key."
            )
        return value


class CustomTemplateUploadSerializer(serializers.Serializer):
    """Serializer for an organizer uploading their own custom template.

    Phase 20: added custom_fields - a JSON-encoded list of
    {field_key, label} dicts (sent as a form field alongside the
    multipart image uploads, since the whole request is multipart/
    form-data). validate_body_text now allows both the standard
    placeholders AND any field_key declared in custom_fields.
    """

    name = serializers.CharField(max_length=150)
    description = serializers.CharField(
        required=False, allow_blank=True, default="", max_length=500
    )
    channel = serializers.ChoiceField(choices=InvitationTemplate.Channel.choices)
    body_text = serializers.CharField(
        required=False, allow_blank=True, default="", max_length=MAX_BODY_TEXT_CHARS
    )
    custom_fields = serializers.ListField(
        child=CustomFieldDefinitionInputSerializer(),
        required=False,
        default=list,
        max_length=MAX_CUSTOM_FIELDS,
    )
    preview_image = serializers.ImageField(
        required=False,
        allow_null=True,
        validators=[FileExtensionValidator(allowed_extensions=ALLOWED_IMAGE_EXTENSIONS)],
    )
    background_image = serializers.ImageField(
        required=False,
        allow_null=True,
        validators=[FileExtensionValidator(allowed_extensions=ALLOWED_IMAGE_EXTENSIONS)],
    )

    def validate_preview_image(self, value):
        if value is not None:
            validate_image_file_size(value, max_size_mb=5)
            validate_image_content(value)
            _validate_image_dimensions(value)
        return value

    def validate_background_image(self, value):
        if value is not None:
            validate_image_file_size(value, max_size_mb=5)
            validate_image_content(value)
            _validate_image_dimensions(value)
        return value

    def validate_custom_fields(self, value: list) -> list:
        keys = [field["field_key"] for field in value]

        if len(keys) != len(set(keys)):
            raise serializers.ValidationError("Custom field keys must be unique within a template.")

        return value

    def validate(self, attrs: dict) -> dict:
        channel = attrs["channel"]
        body_text = attrs.get("body_text", "")
        background_image = attrs.get("background_image")
        custom_field_keys = {field["field_key"] for field in attrs.get("custom_fields", [])}

        if channel in (
            InvitationTemplate.Channel.WHATSAPP,
            InvitationTemplate.Channel.SMS,
            InvitationTemplate.Channel.VOICE_CALL,
        ):
            if not body_text:
                raise serializers.ValidationError(
                    {"body_text": "Message content is required for WhatsApp, SMS, and Voice Call templates."}
                )

        if channel == InvitationTemplate.Channel.EMAIL:
            if not background_image and not body_text:
                raise serializers.ValidationError(
                    {
                        "background_image": (
                            "An Email template needs either a background image, "
                            "message text, or both."
                        )
                    }
                )

        if body_text:
            used_placeholders = set(re.findall(r"\{(\w+)\}", body_text))
            allowed = set(InvitationTemplate.PLACEHOLDER_FIELDS) | custom_field_keys
            unknown = used_placeholders - allowed

            if unknown:
                raise serializers.ValidationError(
                    {
                        "body_text": (
                            f"Unknown placeholder(s): {', '.join('{' + p + '}' for p in sorted(unknown))}. "
                            f"Supported placeholders: {', '.join('{' + p + '}' for p in sorted(allowed))}."
                        )
                    }
                )

        return attrs


class CustomTemplateSerializer(serializers.ModelSerializer):
    """Serializer for reading back an organizer's own custom template
    after upload (confirmation response), including its library slot state."""

    in_library = serializers.SerializerMethodField()
    placeholder_fields = serializers.SerializerMethodField()
    custom_fields = TemplateCustomFieldSerializer(many=True, read_only=True)

    class Meta:
        model = InvitationTemplate
        fields = (
            "id",
            "name",
            "description",
            "channel",
            "preview_image",
            "background_image",
            "body_text",
            "placeholder_fields",
            "custom_fields",
            "is_custom",
            "is_active",
            "created_at",
            "in_library",
        )
        read_only_fields = fields

    def get_in_library(self, obj: InvitationTemplate) -> bool:
        return obj.pk in _library_template_ids(self)

    def get_placeholder_fields(self, obj: InvitationTemplate) -> list[str]:
        return InvitationTemplate.PLACEHOLDER_FIELDS


class GenerateInvitationSerializer(serializers.Serializer):
    """Serializer for validating an invitation generation request (legacy)."""

    guest_id = serializers.IntegerField(required=True)
    template_id = serializers.IntegerField(required=True)


class PreviewInvitationSerializer(serializers.Serializer):
    """Serializer for validating a legacy template preview request."""

    guest_id = serializers.IntegerField(required=True)
    template_id = serializers.IntegerField(required=True)


class InvitationPreviewResultSerializer(serializers.Serializer):
    """Serializer for returning a rendered template preview (legacy)."""

    channel = serializers.CharField()
    rendered_text = serializers.CharField(allow_blank=True)
    has_image = serializers.BooleanField()


class FillActiveTemplateSerializer(serializers.Serializer):
    """Serializer for the Templates page's select -> fill -> confirm action.

    Phase 20. standard_values and custom_values are plain dicts (field
    key -> string value); standard_values may omit any key the organizer
    didn't change, in which case the event's live default is used (see
    services.fill_active_template).
    """

    template_id = serializers.IntegerField(required=True)
    event_id = serializers.IntegerField(required=True)
    standard_values = serializers.DictField(
        child=serializers.CharField(allow_blank=True, max_length=MAX_STANDARD_VALUE_CHARS),
        required=False,
        default=dict,
    )
    custom_values = serializers.DictField(
        child=serializers.CharField(allow_blank=True, max_length=MAX_CUSTOM_VALUE_CHARS),
        required=False,
        default=dict,
    )

    def validate_standard_values(self, value: dict) -> dict:
        if len(value) > MAX_FILL_KEYS:
            raise serializers.ValidationError("Too many values.")
        return value

    def validate_custom_values(self, value: dict) -> dict:
        if len(value) > MAX_FILL_KEYS:
            raise serializers.ValidationError("Too many values.")
        return value


class ActiveFilledTemplateSerializer(serializers.ModelSerializer):
    """Serializer for reading the organizer's current active filled template."""

    template_name = serializers.CharField(source="template.name", read_only=True)
    template_channel = serializers.CharField(source="template.channel", read_only=True)
    template_preview_image = serializers.ImageField(source="template.preview_image", read_only=True)
    event_name = serializers.CharField(source="event.name", read_only=True)

    class Meta:
        model = ActiveFilledTemplate
        fields = (
            "id",
            "template",
            "template_name",
            "template_channel",
            "template_preview_image",
            "event",
            "event_name",
            "standard_values",
            "custom_values",
            "rendered_preview_text",
            "created_at",
            "updated_at",
        )
        read_only_fields = fields


class InvitationSerializer(serializers.ModelSerializer):
    """Serializer for reading a generated invitation's details."""

    guest_name = serializers.CharField(source="guest.name", read_only=True)
    template_name = serializers.CharField(source="template.name", read_only=True)

    class Meta:
        model = Invitation
        fields = (
            "id",
            "guest",
            "guest_name",
            "template",
            "template_name",
            "response_token",
            "image_file",
            "pdf_file",
            "rendered_text",
            "status",
            "created_at",
        )
        read_only_fields = fields


class InvitationSendSerializer(serializers.ModelSerializer):
    """Serializer for reading an invitation send audit record."""

    guest_name = serializers.CharField(source="guest.name", read_only=True)
    template_name = serializers.CharField(source="template.name", read_only=True, default=None)
    sent_by_name = serializers.CharField(source="sent_by.full_name", read_only=True, default=None)

    class Meta:
        model = InvitationSend
        fields = (
            "id",
            "guest",
            "guest_name",
            "template",
            "template_name",
            "channel",
            "status",
            "is_reminder",
            "failure_reason",
            "sent_by_name",
            "sent_at",
            "created_at",
        )
        read_only_fields = fields



class ReminderScheduleSerializer(serializers.ModelSerializer):
    """Serializer for creating/reading a reminder schedule.

    Phase 22. Exactly one of category/guest must be set - enforced both
    by the model's CheckConstraint and here in validate() for a cleaner
    400 error instead of an IntegrityError leaking through.
    """

    category_name = serializers.CharField(source="category.name", read_only=True, default=None)
    guest_name = serializers.CharField(source="guest.name", read_only=True, default=None)

    class Meta:
        model = ReminderSchedule
        fields = (
            "id",
            "category",
            "category_name",
            "guest",
            "guest_name",
            "delay_hours",
            "is_active",
            "created_at",
        )
        read_only_fields = ("id", "category_name", "guest_name", "created_at")

    def validate(self, attrs: dict) -> dict:
        category = attrs.get("category")
        guest = attrs.get("guest")

        if bool(category) == bool(guest):
            raise serializers.ValidationError(
                "Set exactly one of category or guest, not both and not neither."
            )

        delay = attrs.get("delay_hours")

        if delay is not None and not 1 <= delay <= 24 * 30:
            raise serializers.ValidationError(
                {"delay_hours": "Must be between 1 hour and 720 hours (30 days)."}
            )

        return attrs


class PendingWhatsAppReminderSerializer(serializers.ModelSerializer):
    """Serializer for the organizer's 'WhatsApp reminders due' list."""

    guest_name = serializers.CharField(source="guest.name", read_only=True)
    guest_mobile_number = serializers.CharField(source="guest.mobile_number", read_only=True)

    class Meta:
        model = PendingWhatsAppReminder
        fields = (
            "id",
            "guest",
            "guest_name",
            "guest_mobile_number",
            "due_at",
            "created_at",
        )
        read_only_fields = fields