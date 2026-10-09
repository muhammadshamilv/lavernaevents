from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

from common.validators import validate_image_content

from .models import GalleryMedia

IMAGE_EXTENSIONS = {"jpg", "jpeg", "png", "webp"}
VIDEO_EXTENSIONS = {"mp4", "mov", "webm"}


def _looks_like_video(file, extension: str) -> bool:
    """Cheap signature check so a renamed .exe/.html cannot pass as a video.
    mp4/mov carry 'ftyp' (or 'moov'/'mdat'/'free'/'wide') at byte 4; webm is
    an EBML file starting 1A 45 DF A3."""

    position = file.tell()
    try:
        file.seek(0)
        head = file.read(12)
    finally:
        file.seek(position)

    if extension == "webm":
        return head[:4] == b"\x1a\x45\xdf\xa3"

    return head[4:8] in {b"ftyp", b"moov", b"mdat", b"free", b"wide"}


class UploadedBySerializer(serializers.Serializer):
    id = serializers.IntegerField()
    full_name = serializers.CharField()
    role = serializers.CharField()


class GalleryMediaSerializer(serializers.ModelSerializer):
    """Read serializer - used for both the organizer's and the photographer's gallery views."""

    uploaded_by = UploadedBySerializer(read_only=True)

    class Meta:
        model = GalleryMedia
        fields = (
            "id",
            "media_type",
            "file",
            "thumbnail",
            "caption",
            "is_featured",
            "uploaded_by",
            "created_at",
        )
        read_only_fields = fields


class GalleryMediaUploadSerializer(serializers.Serializer):
    """Validates a single-file upload. media_type is inferred from the
    file's extension server-side rather than trusted from the client, so a
    mismatched/spoofed media_type can't be submitted."""

    file = serializers.FileField()
    caption = serializers.CharField(required=False, allow_blank=True, default="", max_length=200)
    thumbnail = serializers.ImageField(required=False, allow_null=True)

    def validate_file(self, value):
        extension = value.name.rsplit(".", 1)[-1].lower() if "." in value.name else ""

        if extension not in IMAGE_EXTENSIONS | VIDEO_EXTENSIONS:
            raise serializers.ValidationError(
                "Unsupported file type. Allowed: jpg, jpeg, png, webp, mp4, mov, webm."
            )

        if extension in IMAGE_EXTENSIONS:
            try:
                validate_image_content(value)
            except DjangoValidationError as error:
                raise serializers.ValidationError(error.messages)
        elif not _looks_like_video(value, extension):
            raise serializers.ValidationError("This file is not a valid video.")

        return value

    def validate_thumbnail(self, value):
        if value is not None:
            try:
                validate_image_content(value)
            except DjangoValidationError as error:
                raise serializers.ValidationError(error.messages)

        return value

    def validate(self, attrs):
        extension = attrs["file"].name.rsplit(".", 1)[-1].lower()

        attrs["media_type"] = (
            GalleryMedia.MediaType.IMAGE if extension in IMAGE_EXTENSIONS else GalleryMedia.MediaType.VIDEO
        )

        return attrs
    