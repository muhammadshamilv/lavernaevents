# backend/users/models.py
import secrets
from datetime import timedelta

from django.contrib.auth.models import AbstractBaseUser, PermissionsMixin
from django.core.validators import FileExtensionValidator
from django.db import models
from django.utils import timezone

from .managers import UserManager


class User(AbstractBaseUser, PermissionsMixin):
    """Custom user model for LavernaEvents."""

    class Role(models.TextChoices):
        ADMIN = "ADMIN", "Admin"
        ORGANIZER = "ORGANIZER", "Organizer"
        PHOTOGRAPHER = "PHOTOGRAPHER", "Photographer"
        GUEST = "GUEST", "Guest"

    full_name = models.CharField(
        max_length=150,
    )

    email = models.EmailField(
        unique=True,
        db_index=True,
    )

    mobile_number = models.CharField(
        max_length=20,
        unique=True,
        db_index=True,
    )

    profile_image = models.ImageField(
        upload_to="users/profile/",
        blank=True,
        null=True,
        validators=[
            FileExtensionValidator(
                allowed_extensions=["jpg", "jpeg", "png"]
            )
        ],
    )

    role = models.CharField(
        max_length=20,
        choices=Role.choices,
        default=Role.ORGANIZER,
    )

    is_verified = models.BooleanField(
        default=False,
    )

    is_active = models.BooleanField(
        default=True,
    )

    is_staff = models.BooleanField(
        default=False,
    )

    # Set by an admin via the User Management "Suspend" action. Checked at
    # login, on every authenticated request and on token refresh, so a
    # suspended user is locked out immediately (separate from is_active,
    # which Django's own auth system also uses).
    is_suspended = models.BooleanField(
        default=False,
        help_text="Set by an admin to block this user from logging in.",
    )

    created_at = models.DateTimeField(
        auto_now_add=True,
    )

    updated_at = models.DateTimeField(
        auto_now=True,
    )

    objects = UserManager()

    USERNAME_FIELD = "mobile_number"

    REQUIRED_FIELDS = [
        "email",
        "full_name",
    ]

    class Meta:
        db_table = "users"
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"{self.full_name} ({self.mobile_number})"


class MobileOTP(models.Model):
    """A one-time code sent to a user (SMS / email) for one purpose:
    verifying the mobile number after registration, or resetting a
    forgotten password."""

    class Purpose(models.TextChoices):
        VERIFY_MOBILE = "VERIFY_MOBILE", "Verify mobile number"
        RESET_PASSWORD = "RESET_PASSWORD", "Reset password"

    # A code is dead after this many wrong guesses (stops brute-forcing
    # the 1,000,000 possible codes during the validity window).
    MAX_ATTEMPTS = 5

    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="mobile_otps",
    )

    purpose = models.CharField(
        max_length=20,
        choices=Purpose.choices,
        default=Purpose.VERIFY_MOBILE,
    )

    code = models.CharField(
        max_length=6,
    )

    attempts = models.PositiveSmallIntegerField(
        default=0,
    )

    is_used = models.BooleanField(
        default=False,
    )

    expires_at = models.DateTimeField()

    created_at = models.DateTimeField(
        auto_now_add=True,
    )

    class Meta:
        db_table = "mobile_otps"
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"{self.purpose} OTP for {self.user.mobile_number}"

    @staticmethod
    def generate_code() -> str:
        """A random 6-digit code from the operating system's secure
        random source (not the predictable `random` module)."""

        return f"{secrets.randbelow(1_000_000):06d}"

    @classmethod
    def create_for_user(
        cls,
        user: User,
        purpose: str = "VERIFY_MOBILE",
        validity_minutes: int = 10,
    ) -> "MobileOTP":
        """Create a new OTP, retiring any unused OTPs of the SAME purpose."""

        cls.objects.filter(
            user=user,
            purpose=purpose,
            is_used=False,
        ).update(is_used=True)

        return cls.objects.create(
            user=user,
            purpose=purpose,
            code=cls.generate_code(),
            expires_at=timezone.now() + timedelta(minutes=validity_minutes),
        )

    def is_valid(self) -> bool:
        """True while the code is unused, unexpired and not locked out."""

        return (
            not self.is_used
            and timezone.now() <= self.expires_at
            and self.attempts < self.MAX_ATTEMPTS
        )
