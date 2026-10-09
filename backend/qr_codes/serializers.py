from django.core.exceptions import ValidationError as DjangoValidationError
from urllib.parse import quote

from rest_framework import serializers

from common.validators import validate_image_content
from gallery.models import GalleryMedia

from .models import EventQRCode
from .download_tokens import make_download_token
from .services import build_scan_url, public_backend_url


def _absolute_file_url(request, file_field) -> str | None:
    """Absolute URL of an uploaded file. Cloud storage already returns a
    full https:// address; local storage returns /media/... which needs
    the PUBLIC address of this backend (not the internal host a proxy
    would show in request.build_absolute_uri)."""

    if not file_field:
        return None

    url = file_field.url

    if url.startswith(("http://", "https://")):
        return url

    base = public_backend_url() or (request.build_absolute_uri("/").rstrip("/") if request else "")

    return f"{base}{url}"


class EventQRCodeSerializer(serializers.Serializer):
    """Organizer-facing: what the QR management page needs."""

    token = serializers.SerializerMethodField()
    scan_url = serializers.SerializerMethodField()
    is_active = serializers.SerializerMethodField()
    png_download_url = serializers.SerializerMethodField()
    pdf_download_url = serializers.SerializerMethodField()

    def get_token(self, qr_code: EventQRCode) -> str:
        return str(qr_code.token)

    def get_scan_url(self, qr_code: EventQRCode) -> str:
        return build_scan_url(qr_code)

    def get_is_active(self, qr_code: EventQRCode) -> bool:
        return qr_code.is_active

    def _download_url(self, qr_code: EventQRCode, suffix: str) -> str:
        request = self.context.get("request")
        path = f"/api/events/{qr_code.event_id}/qr-code/{suffix}/"
        base = public_backend_url() or (request.build_absolute_uri("/").rstrip("/") if request else "")
        return f"{base}{path}"

    def get_png_download_url(self, qr_code: EventQRCode) -> str:
        return self._download_url(qr_code, "png")

    def get_pdf_download_url(self, qr_code: EventQRCode) -> str:
        return self._download_url(qr_code, "pdf")


class QRCodeActiveSerializer(serializers.Serializer):
    is_active = serializers.BooleanField()


class ScannedEventSerializer(serializers.Serializer):
    """Public, guest-facing: the minimum event info shown on the scan
    landing page before the guest takes a selfie. No numeric id, no
    address, no guest data - a guest has no login and no access grant."""

    name = serializers.CharField()
    event_date = serializers.DateField()
    cover_image = serializers.SerializerMethodField()

    def get_cover_image(self, event) -> str | None:
        return _absolute_file_url(self.context.get("request"), event.cover_image)


class SelfieUploadSerializer(serializers.Serializer):
    """Validates the guest's selfie upload (image only, size-capped: this
    endpoint is public and does CPU-heavy work)."""

    selfie = serializers.ImageField()

    def validate_selfie(self, value):
        from .services import MAX_SELFIE_BYTES

        if value.size > MAX_SELFIE_BYTES:
            raise serializers.ValidationError(
                "That photo is too large. Please take a new selfie."
            )

        # Real jpeg/png/webp only (this endpoint is public).
        try:
            validate_image_content(value)
        except DjangoValidationError as error:
            raise serializers.ValidationError(error.messages)

        return value


class GuestMediaSerializer(serializers.ModelSerializer):
    """What an anonymous guest may see about a matched photo. Unlike the
    organizer's GalleryMediaSerializer it does NOT include `uploaded_by`
    (the photographer's / organizer's name and user id) - none of that is
    a stranger's business."""

    file = serializers.SerializerMethodField()
    thumbnail = serializers.SerializerMethodField()
    download_url = serializers.SerializerMethodField()

    class Meta:
        model = GalleryMedia
        fields = ("id", "media_type", "file", "thumbnail", "caption", "created_at", "download_url")
        read_only_fields = fields

    def get_file(self, media) -> str | None:
        return _absolute_file_url(self.context.get("request"), media.file)

    def get_thumbnail(self, media) -> str | None:
        return _absolute_file_url(self.context.get("request"), media.thumbnail)

    def get_download_url(self, media) -> str:
        token = self.context["token"]
        signed = quote(make_download_token(token, media.id), safe="")
        # The signature (?t=) is what authorises this one download.
        return f"/api/qr/{token}/media/{media.id}/download/?t={signed}"


class SelfieMatchResultSerializer(serializers.Serializer):
    match_count = serializers.IntegerField()
    matched_media = GuestMediaSerializer(many=True)