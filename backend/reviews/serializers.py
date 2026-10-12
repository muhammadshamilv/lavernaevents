import re

from rest_framework import serializers

from .models import Review

# Characters that have no business in a name or a review (control characters).
_CONTROL_CHARS = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")


def _clean(value: str) -> str:
    """Strip control characters and collapse stray whitespace."""

    value = _CONTROL_CHARS.sub("", value or "")
    return re.sub(r"[ \t]+", " ", value).strip()


class ReviewCreateSerializer(serializers.Serializer):
    """What a visitor may send. Nothing else is accepted."""

    name = serializers.CharField(max_length=80)
    title = serializers.CharField(max_length=80, required=False, allow_blank=True, default="")
    rating = serializers.IntegerField(min_value=1, max_value=5)
    message = serializers.CharField(min_length=10, max_length=1000)

    # A field real people never see. Bots that fill every input fill this too.
    website = serializers.CharField(required=False, allow_blank=True, default="", write_only=True)

    def validate_name(self, value):
        value = _clean(value)
        if len(value) < 2:
            raise serializers.ValidationError("Please enter your name.")
        return value

    def validate_title(self, value):
        return _clean(value)

    def validate_message(self, value):
        value = _clean(value)
        if len(value) < 10:
            raise serializers.ValidationError("Please write at least a few words (10 characters).")
        if re.search(r"https?://|www\.", value, re.IGNORECASE):
            raise serializers.ValidationError("Please leave web links out of your review.")
        return value


class PublicReviewSerializer(serializers.ModelSerializer):
    """The published review as the public site shows it."""

    class Meta:
        model = Review
        fields = ["id", "name", "title", "rating", "message", "created_at"]


class AdminReviewSerializer(serializers.ModelSerializer):
    class Meta:
        model = Review
        fields = [
            "id",
            "name",
            "title",
            "rating",
            "message",
            "is_read",
            "is_published",
            "created_at",
        ]
        read_only_fields = ["id", "name", "title", "rating", "message", "created_at"]