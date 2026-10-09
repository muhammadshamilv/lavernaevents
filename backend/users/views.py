# backend/users/views.py
from django.conf import settings
from rest_framework import status
from rest_framework.exceptions import AuthenticationFailed
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.settings import api_settings as jwt_settings
from rest_framework_simplejwt.tokens import RefreshToken

from .models import User
from .serializers import (
    ChangePasswordSerializer,
    ForgotPasswordSerializer,
    ResendOTPSerializer,
    ResetPasswordSerializer,
    UpdateProfileSerializer,
    UserLoginSerializer,
    UserRegistrationSerializer,
    UserTokenRefreshSerializer,
    VerifyMobileSerializer,
)
from .services import (
    RESEND_COOLDOWN_SECONDS,
    OTPThrottled,
    describe_delivery,
    get_user_by_mobile,
    request_password_reset,
    reset_password_with_otp,
    revoke_user_sessions,
    send_verification_otp,
    verify_otp_code,
)


def _user_payload(user: User, request=None) -> dict:
    """The user fields the frontend needs."""

    profile_image = ""

    if user.profile_image:
        try:
            url = user.profile_image.url
            profile_image = request.build_absolute_uri(url) if request else url
        except ValueError:
            profile_image = ""

    return {
        "id": user.id,
        "full_name": user.full_name,
        "email": user.email,
        "mobile_number": user.mobile_number,
        "role": user.role,
        "is_verified": user.is_verified,
        "is_active": user.is_active,
        "profile_image": profile_image,
    }


def _set_auth_cookies(response: Response, access: str, refresh: str) -> None:
    """Attach the access and refresh tokens as httpOnly cookies."""

    access_lifetime = settings.SIMPLE_JWT["ACCESS_TOKEN_LIFETIME"]
    refresh_lifetime = settings.SIMPLE_JWT["REFRESH_TOKEN_LIFETIME"]

    response.set_cookie(
        "access_token",
        access,
        max_age=int(access_lifetime.total_seconds()),
        httponly=True,
        secure=settings.AUTH_COOKIE_SECURE,
        samesite=settings.AUTH_COOKIE_SAMESITE,
        path="/",
    )

    response.set_cookie(
        "refresh_token",
        refresh,
        max_age=int(refresh_lifetime.total_seconds()),
        httponly=True,
        secure=settings.AUTH_COOKIE_SECURE,
        samesite=settings.AUTH_COOKIE_SAMESITE,
        path="/",
    )


def _clear_auth_cookies(response: Response) -> None:
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")


def _error(message: str, errors: dict, http_status: int) -> Response:
    return Response(
        {"success": False, "message": message, "errors": errors},
        status=http_status,
    )


class UserRegistrationView(APIView):
    """Register a new LavernaEvents user and send the verification code."""

    permission_classes = [AllowAny]

    def post(self, request):
        serializer = UserRegistrationSerializer(data=request.data)

        if not serializer.is_valid():
            return _error(
                "Registration failed.",
                serializer.errors,
                status.HTTP_400_BAD_REQUEST,
            )

        user = serializer.save()

        otp = send_verification_otp(user)

        return Response(
            {
                "success": True,
                "message": (
                    "User registered successfully. "
                    f"A verification code has been {describe_delivery(otp)}."
                ),
                "data": {
                    **_user_payload(user, request),
                    "cooldown_seconds": RESEND_COOLDOWN_SECONDS,
                },
            },
            status=status.HTTP_201_CREATED,
        )


class UserLoginView(APIView):
    """Authenticate with mobile number and password."""

    permission_classes = [AllowAny]

    def post(self, request):
        serializer = UserLoginSerializer(data=request.data)

        try:
            serializer.is_valid(raise_exception=True)

        except AuthenticationFailed as error:
            # A suspended account gets its own clear message (403);
            # everything else stays a deliberately vague 401.
            if getattr(error.detail, "code", "") == "account_suspended":
                message = str(error.detail)

                return _error(
                    message,
                    {"account": [message]},
                    status.HTTP_403_FORBIDDEN,
                )

            return _error(
                "Invalid mobile number or password.",
                {"authentication": ["Invalid credentials."]},
                status.HTTP_401_UNAUTHORIZED,
            )

        except Exception as error:  # ValidationError for missing fields etc.
            detail = getattr(error, "detail", None)

            if detail is None:
                raise

            return _error(
                "Login failed.",
                detail if isinstance(detail, dict) else {"detail": detail},
                status.HTTP_400_BAD_REQUEST,
            )

        response = Response(
            {
                "success": True,
                "message": "Login successful.",
                "data": {"user": serializer.validated_data["user"]},
            },
            status=status.HTTP_200_OK,
        )

        _set_auth_cookies(
            response,
            access=str(serializer.validated_data["access"]),
            refresh=str(serializer.validated_data["refresh"]),
        )

        return response


class UserTokenRefreshView(APIView):
    """Generate a new access token from the refresh-token cookie."""

    permission_classes = [AllowAny]

    def post(self, request):
        refresh_token = request.COOKIES.get("refresh_token")

        if not refresh_token:
            return _error(
                "Token refresh failed.",
                {"refresh": ["No refresh token cookie was found."]},
                status.HTTP_401_UNAUTHORIZED,
            )

        # A suspended or deactivated user must not be able to keep
        # refreshing their way back in.
        try:
            token = RefreshToken(refresh_token)
            user = User.objects.filter(pk=token[jwt_settings.USER_ID_CLAIM]).first()
        except TokenError:
            user = None

        if user is None or not user.is_active or user.is_suspended:
            response = _error(
                "Token refresh failed.",
                {"refresh": ["Session is no longer valid."]},
                status.HTTP_401_UNAUTHORIZED,
            )
            _clear_auth_cookies(response)

            return response

        serializer = UserTokenRefreshSerializer(data={"refresh": refresh_token})

        if not serializer.is_valid():
            return _error(
                "Token refresh failed.",
                serializer.errors,
                status.HTTP_401_UNAUTHORIZED,
            )

        response = Response(
            {
                "success": True,
                "message": "Access token refreshed successfully.",
                "data": {},
            },
            status=status.HTTP_200_OK,
        )

        access_lifetime = settings.SIMPLE_JWT["ACCESS_TOKEN_LIFETIME"]

        response.set_cookie(
            "access_token",
            str(serializer.validated_data["access"]),
            max_age=int(access_lifetime.total_seconds()),
            httponly=True,
            secure=settings.AUTH_COOKIE_SECURE,
            samesite=settings.AUTH_COOKIE_SAMESITE,
            path="/",
        )

        return response


class UserLogoutView(APIView):
    """Logout by blacklisting the refresh token."""

    permission_classes = [AllowAny]

    def post(self, request):
        refresh_token = request.COOKIES.get("refresh_token")

        if refresh_token:
            try:
                RefreshToken(refresh_token).blacklist()
            except TokenError:
                pass

        response = Response(
            {"success": True, "message": "Logout successful.", "data": {}},
            status=status.HTTP_200_OK,
        )

        _clear_auth_cookies(response)

        return response


class ForgotPasswordView(APIView):
    """Send a password-reset code to the account's email and mobile.

    The answer is always the same, whether or not the account exists, so
    nobody can use this form to find out who is registered.
    """

    permission_classes = [AllowAny]

    def post(self, request):
        serializer = ForgotPasswordSerializer(data=request.data)

        if not serializer.is_valid():
            return _error(
                "Invalid request.",
                serializer.errors,
                status.HTTP_400_BAD_REQUEST,
            )

        request_password_reset(serializer.validated_data["identifier"])

        return Response(
            {
                "success": True,
                "message": (
                    "If an account exists for that email or mobile number, "
                    "a 6-digit reset code has been sent."
                ),
                "data": {"cooldown_seconds": RESEND_COOLDOWN_SECONDS},
            },
            status=status.HTTP_200_OK,
        )


class ResetPasswordView(APIView):
    """Set a new password using the 6-digit code."""

    permission_classes = [AllowAny]

    def post(self, request):
        serializer = ResetPasswordSerializer(data=request.data)

        if not serializer.is_valid():
            return _error(
                "Password reset failed.",
                serializer.errors,
                status.HTTP_400_BAD_REQUEST,
            )

        success, message = reset_password_with_otp(
            identifier=serializer.validated_data["identifier"],
            code=serializer.validated_data["code"],
            new_password=serializer.validated_data["new_password"],
        )

        if not success:
            return _error(
                message,
                {"code": [message]},
                status.HTTP_400_BAD_REQUEST,
            )

        return Response(
            {"success": True, "message": message, "data": {}},
            status=status.HTTP_200_OK,
        )


class VerifyMobileView(APIView):
    """Confirm a mobile number using the registration code."""

    permission_classes = [AllowAny]

    def post(self, request):
        serializer = VerifyMobileSerializer(data=request.data)

        if not serializer.is_valid():
            return _error(
                "Invalid request.",
                serializer.errors,
                status.HTTP_400_BAD_REQUEST,
            )

        success, message = verify_otp_code(
            mobile_number=serializer.validated_data["mobile_number"],
            code=serializer.validated_data["code"],
        )

        if not success:
            return _error(
                message,
                {"code": [message]},
                status.HTTP_400_BAD_REQUEST,
            )

        return Response(
            {"success": True, "message": message, "data": {}},
            status=status.HTTP_200_OK,
        )


class ResendOTPView(APIView):
    """Send a fresh registration code (same answer for every number)."""

    permission_classes = [AllowAny]

    def post(self, request):
        serializer = ResendOTPSerializer(data=request.data)

        if not serializer.is_valid():
            return _error(
                "Invalid request.",
                serializer.errors,
                status.HTTP_400_BAD_REQUEST,
            )

        user = get_user_by_mobile(serializer.validated_data["mobile_number"])

        if user is not None and not user.is_verified:
            try:
                send_verification_otp(user)
            except OTPThrottled:
                pass

        return Response(
            {
                "success": True,
                "message": (
                    "If an unverified account with that mobile number exists, "
                    "a new verification code has been sent."
                ),
                "data": {"cooldown_seconds": RESEND_COOLDOWN_SECONDS},
            },
            status=status.HTTP_200_OK,
        )


class UserMeView(APIView):
    """The logged-in user's profile: read it (GET) or update it (PATCH)."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(
            {
                "success": True,
                "message": "Current user retrieved successfully.",
                "data": _user_payload(request.user, request),
            },
            status=status.HTTP_200_OK,
        )

    def patch(self, request):
        serializer = UpdateProfileSerializer(data=request.data)

        if not serializer.is_valid():
            return _error(
                "Profile update failed.",
                serializer.errors,
                status.HTTP_400_BAD_REQUEST,
            )

        user = request.user
        changed = []

        for field in ("full_name", "profile_image"):
            if field in serializer.validated_data:
                setattr(user, field, serializer.validated_data[field])
                changed.append(field)

        if changed:
            user.save(update_fields=[*changed, "updated_at"])

        return Response(
            {
                "success": True,
                "message": "Profile updated successfully.",
                "data": _user_payload(user, request),
            },
            status=status.HTTP_200_OK,
        )


class ChangePasswordView(APIView):
    """A logged-in user changes their password. Every other login ends;
    this browser stays logged in with fresh tokens."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = ChangePasswordSerializer(
            data=request.data,
            context={"request": request},
        )

        if not serializer.is_valid():
            return _error(
                "Password change failed.",
                serializer.errors,
                status.HTTP_400_BAD_REQUEST,
            )

        user = request.user
        user.set_password(serializer.validated_data["new_password"])
        user.save(update_fields=["password", "updated_at"])

        revoke_user_sessions(user)

        refresh = RefreshToken.for_user(user)

        response = Response(
            {"success": True, "message": "Password changed successfully.", "data": {}},
            status=status.HTTP_200_OK,
        )

        _set_auth_cookies(
            response,
            access=str(refresh.access_token),
            refresh=str(refresh),
        )

        return response
