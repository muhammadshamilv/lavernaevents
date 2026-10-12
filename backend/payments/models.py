from common.models import TimeStampedModel
from django.db import models


class Payment(TimeStampedModel):
    """Tracks an online (Cashfree) payment attempt for a membership plan purchase."""

    class Status(models.TextChoices):
        CREATED = "CREATED", "Created"
        PAID = "PAID", "Paid"
        FAILED = "FAILED", "Failed"

    user = models.ForeignKey(
        "users.User",
        on_delete=models.CASCADE,
        related_name="payments",
    )

    plan = models.ForeignKey(
        "memberships.MembershipPlan",
        on_delete=models.PROTECT,
        related_name="payments",
    )

    stripe_checkout_session_id = models.CharField(
        max_length=200,
        unique=True,
    )

    stripe_payment_intent_id = models.CharField(
        max_length=200,
        blank=True,
    )

    amount = models.DecimalField(
        max_digits=10,
        decimal_places=2,
    )

    currency = models.CharField(
        max_length=10,
        default="INR",
    )

    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.CREATED,
    )

    class Meta:
        db_table = "payments"
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"{self.user.mobile_number} - {self.plan.name} - {self.status}"
