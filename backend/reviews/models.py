from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models


class Review(models.Model):
    """A visitor's review of LavernaEvents.

    Reviews arrive unpublished. Only an admin can publish one, so nothing a
    stranger types ever appears on the public site until it has been read.
    """

    name = models.CharField(max_length=80)
    # Optional line under the name, e.g. "Wedding host" or "Photographer".
    title = models.CharField(max_length=80, blank=True)
    rating = models.PositiveSmallIntegerField(
        validators=[MinValueValidator(1), MaxValueValidator(5)],
    )
    message = models.TextField(max_length=1000)

    is_read = models.BooleanField(default=False)
    is_published = models.BooleanField(default=False)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        indexes = [
            models.Index(fields=["is_published", "-created_at"]),
            models.Index(fields=["is_read"]),
        ]

    def __str__(self) -> str:
        return f"{self.name} ({self.rating}/5)"