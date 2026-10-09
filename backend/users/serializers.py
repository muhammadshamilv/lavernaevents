# backend/users/serializers.py
import re

from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers
from rest_framework.exceptions import AuthenticationFailed
from rest_framework_simplejwt.serializers import (
    TokenObtainPairSerializer,
    TokenRefreshSerializer,
)

from common.phone import canonical_mobile, clean_phone_text
from common.validators import validate_image_file_size

from .models import User
from .services import get_user_by_mobile


def _reject_impossible_indian_mobile(mobile: str) -> None:
    """Indian mobile numbers start with 6, 7, 8 or 9, so a 10-digit number
    (or +91 plus 10 digits) starting with anything else - like the classic
    1234567890 - can never receive an SMS or call. Numbers from other
    countries are left alone."""

    digits = re.sub(r"\D", "", mobile)

    if len(digits) == 12 and digits.startswith("91"):
        national = digits[2:]
    elif len(digits) == 10:
        national = digits
    else:
        return

    if national[0] not in "6789" or len(set(national)) == 1:
        raise serializers.ValidationError("Enter a valid mobile number.")


def _normalize_mobile_input(value: str) -> str:
    """Accept 9188560170, +91 91885 60170, 09188560170 ... and return the
    one canonical form stored on the user."""

    cleaned = clean_phone_text(value)

    if not cleaned:
        raise serializers.ValidationError("Mobile number is required.")

    if not re.fullmatch(r"\+?\d+", cleaned):
        raise serializers.ValidationError(
            "Mobile number must contain only digits (a leading + is allowed)."
        )

    mobile = canonical_mobile(cleaned)

    if len(mobile) < 10 or len(mobile) > 15:
        raise serializers.ValidationError(
            "Mobile number must contain between 10 and 15 digits."
        )

    _reject_impossible_indian_mobile(mobile)

    return mobile


class UserRegistrationSerializer(serializers.ModelSerializer):
    """Serializer for creating a new LavernaEvents user."""

    password = serializers.CharField(
        write_only=True,
        required=True,
        min_length=8,
        style={"input_type": "password"},
    )

    password_confirm = serializers.CharField(
        write_only=True,
        required=True,
        style={"input_type": "password"},
    )

    # Restricted to ORGANIZER and PHOTOGRAPHER: ADMIN accounts are never
    # self-service (createsuperuser / Django admin only) and GUEST is not
    # a login-capable role (guests use their response link).
    role = serializers.ChoiceField(
        choices=[
            (User.Role.ORGANIZER, User.Role.ORGANIZER.label),
            (User.Role.PHOTOGRAPHER, User.Role.PHOTOGRAPHER.label),
        ],
        required=False,
        default=User.Role.ORGANIZER,
    )

    class Meta:
        model = User
        fields = (
            "full_name",
            "email",
            "mobile_number",
            "password",
            "password_confirm",
            "role",
        )

        # The model's unique=True would add its own (differently worded)
        # validators for these two; the methods below do the checks.
        extra_kwargs = {
            "email": {"validators": []},
            "mobile_number": {"validators": []},
        }

    def validate_full_name(self, value: str) -> str:
        value = value.strip()

        if not value:
            raise serializers.ValidationError("Full name is required.")

        return value

    def validate_email(self, value: str) -> str:
        value = value.strip().lower()

        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError(
                "A user with this email already exists."
            )

        return value

    def validate_mobile_number(self, value: str) -> str:
        mobile = _normalize_mobile_input(value)

        if get_user_by_mobile(mobile) is not None:
            raise serializers.ValidationError(
                "A user with this mobile number already exists."
            )

        return mobile

    def validate_password(self, value: str) -> str:
        validate_password(value)

        return value

    def validate(self, attrs: dict) -> dict:
        if attrs["password"] != attrs["password_confirm"]:
            raise serializers.ValidationError(
                {"password_confirm": "Passwords do not match."}
            )

        return attrs

    def create(self, validated_data: dict) -> User:
        validated_data.pop("password_confirm")

        password = validated_data.pop("password")

        return User.objects.create_user(
            password=password,
            **validated_data,
        )


class UserLoginSerializer(TokenObtainPairSerializer):
    """Mobile-number based JWT login."""

    username_field = "mobile_number"

    def validate(self, attrs: dict) -> dict:
        # Let people log in with 9188560170, +919188560170 and so on.
        user = get_user_by_mobile(attrs.get("mobile_number", ""))

        if user is not None:
            attrs["mobile_number"] = user.mobile_number

        data = super().validate(attrs)

        user = self.user

        # A suspended user is fully blocked even with the right password.
        # The view turns this exact code into a clear 403 message.
        if user.is_suspended:
            raise AuthenticationFailed(
                "Your account has been suspended. Please contact support.",
                code="account_suspended",
            )

        data["user"] = {
            "id": user.id,
            "full_name": user.full_name,
            "email": user.email,
            "mobile_number": user.mobile_number,
            "role": user.role,
            "is_verified": user.is_verified,
            "is_active": user.is_active,
        }

        return data


class UserTokenRefreshSerializer(TokenRefreshSerializer):
    """Refresh an access token."""

    pass


class ForgotPasswordSerializer(serializers.Serializer):
    """Ask for a password-reset code by email or mobile number."""

    identifier = serializers.CharField(required=False, allow_blank=True)
    email = serializers.EmailField(required=False, allow_blank=True)
    mobile_number = serializers.CharField(required=False, allow_blank=True)

    def validate(self, attrs: dict) -> dict:
        value = (
            attrs.get("identifier")
            or attrs.get("email")
            or attrs.get("mobile_number")
            or ""
        ).strip()

        if not value:
            raise serializers.ValidationError(
                {"identifier": "Enter your email or mobile number."}
            )

        attrs["identifier"] = value.lower() if "@" in value else value

        return attrs


class ResetPasswordSerializer(serializers.Serializer):
    """Set a new password using the code sent by SMS / email."""

    identifier = serializers.CharField(required=False, allow_blank=True)
    email = serializers.EmailField(required=False, allow_blank=True)
    mobile_number = serializers.CharField(required=False, allow_blank=True)

    code = serializers.RegexField(
        r"^\d{6}$",
        required=True,
        error_messages={"invalid": "Enter the 6-digit code."},
    )

    new_password = serializers.CharField(
        write_only=True,
        required=True,
        min_length=8,
        style={"input_type": "password"},
    )

    new_password_confirm = serializers.CharField(
        write_only=True,
        required=True,
        style={"input_type": "password"},
    )

    def validate_new_password(self, value: str) -> str:
        validate_password(value)

        return value

    def validate(self, attrs: dict) -> dict:
        value = (
            attrs.get("identifier")
            or attrs.get("email")
            or attrs.get("mobile_number")
            or ""
        ).strip()

        if not value:
            raise serializers.ValidationError(
                {"identifier": "Enter your email or mobile number."}
            )

        if attrs["new_password"] != attrs["new_password_confirm"]:
            raise serializers.ValidationError(
                {"new_password_confirm": "Passwords do not match."}
            )

        attrs["identifier"] = value.lower() if "@" in value else value

        return attrs


class ChangePasswordSerializer(serializers.Serializer):
    """A logged-in user changes their own password."""

    current_password = serializers.CharField(
        write_only=True,
        required=True,
        style={"input_type": "password"},
    )

    new_password = serializers.CharField(
        write_only=True,
        required=True,
        min_length=8,
        style={"input_type": "password"},
    )

    new_password_confirm = serializers.CharField(
        write_only=True,
        required=True,
        style={"input_type": "password"},
    )

    def validate_current_password(self, value: str) -> str:
        user = self.context["request"].user

        if not user.check_password(value):
            raise serializers.ValidationError("Current password is incorrect.")

        return value

    def validate_new_password(self, value: str) -> str:
        validate_password(value, user=self.context["request"].user)

        return value

    def validate(self, attrs: dict) -> dict:
        if attrs["new_password"] != attrs["new_password_confirm"]:
            raise serializers.ValidationError(
                {"new_password_confirm": "Passwords do not match."}
            )

        if attrs["new_password"] == attrs["current_password"]:
            raise serializers.ValidationError(
                {"new_password": "The new password must be different from the current one."}
            )

        return attrs


class UpdateProfileSerializer(serializers.Serializer):
    """Fields a user can change on their own profile."""

    full_name = serializers.CharField(required=False, max_length=150)

    profile_image = serializers.ImageField(required=False)

    def validate_full_name(self, value: str) -> str:
        value = value.strip()

        if not value:
            raise serializers.ValidationError("Full name cannot be empty.")

        return value

    def validate_profile_image(self, value):
        validate_image_file_size(value, max_size_mb=5)

        extension = value.name.rsplit(".", 1)[-1].lower() if "." in value.name else ""

        if extension not in ("jpg", "jpeg", "png"):
            raise serializers.ValidationError("Only JPG and PNG images are allowed.")

        return value


class VerifyMobileSerializer(serializers.Serializer):
    """Confirm a mobile number using an OTP code."""

    mobile_number = serializers.CharField(required=True)

    code = serializers.RegexField(
        r"^\d{6}$",
        required=True,
        error_messages={"invalid": "Enter the 6-digit code."},
    )

    def validate_mobile_number(self, value: str) -> str:
        return value.strip()


class ResendOTPSerializer(serializers.Serializer):
    """Ask for a new mobile verification code."""

    mobile_number = serializers.CharField(required=True)

    def validate_mobile_number(self, value: str) -> str:
        return value.strip()


class UserLogoutSerializer(serializers.Serializer):
    """Validate a refresh token during logout."""

    refresh = serializers.CharField(
        required=True,
        write_only=True,
    )