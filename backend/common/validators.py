from django.core.exceptions import ValidationError
from django.core.validators import FileExtensionValidator

ALLOWED_IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "webp"]

ALLOWED_VIDEO_EXTENSIONS = ["mp4", "mov", "webm"]

ALLOWED_DOCUMENT_EXTENSIONS = ["pdf"]


def validate_image_file_size(file, max_size_mb: int = 5) -> None:
    """Raise ValidationError if the uploaded image exceeds max_size_mb.

    Usage inside a model field (use a named function, NOT a lambda -
    migrations cannot serialize lambdas):
        validators=[validate_image_max_5mb]
    """

    max_size_bytes = max_size_mb * 1024 * 1024

    if file.size > max_size_bytes:
        raise ValidationError(
            f"File too large. Maximum allowed size is {max_size_mb} MB."
        )


def validate_video_file_size(file, max_size_mb: int = 100) -> None:
    """Raise ValidationError if the uploaded video exceeds max_size_mb."""

    max_size_bytes = max_size_mb * 1024 * 1024

    if file.size > max_size_bytes:
        raise ValidationError(
            f"File too large. Maximum allowed size is {max_size_mb} MB."
        )


def validate_image_max_5mb(file) -> None:
    """Named (migration-safe) 5 MB image limit for model fields."""

    validate_image_file_size(file, max_size_mb=5)


# Reusable, migration-serializable extension check for image fields.
validate_image_extension = FileExtensionValidator(
    allowed_extensions=ALLOWED_IMAGE_EXTENSIONS
)


def validate_image_content(file) -> None:
    """Reject files that merely LOOK like images (e.g. renamed .exe/.html).

    The extension check only trusts the file name. This opens the bytes with
    Pillow and requires a real jpeg/png/webp. Call it from serializers that
    accept user images (selfie, template, gallery photo).
    """

    from PIL import Image, UnidentifiedImageError

    try:
        position = file.tell()
    except (AttributeError, OSError):
        position = 0

    try:
        file.seek(0)
        with Image.open(file) as image:
            image.verify()
            image_format = (image.format or "").upper()
    except (UnidentifiedImageError, OSError, SyntaxError, ValueError, Image.DecompressionBombError):
        raise ValidationError("This file is not a valid image.")
    finally:
        try:
            file.seek(position)
        except (AttributeError, OSError):
            pass

    if image_format not in {"JPEG", "PNG", "WEBP"}:
        raise ValidationError("Only JPG, PNG or WEBP images are allowed.")