from django.conf import settings
from django.contrib.auth.tokens import PasswordResetTokenGenerator
from django.core.mail import send_mail
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode

from rest_framework import serializers, status
from rest_framework.exceptions import AuthenticationFailed
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken

from decouple import config

from .models import User
from .serializers import (
    ForgotPasswordSerializer,
    ResendOTPSerializer,
    ResetPasswordSerializer,
    UserLoginSerializer,
    UserRegistrationSerializer,
    UserTokenRefreshSerializer,
    VerifyMobileSerializer,
)
from .services import send_verification_otp, verify_otp_code


def _set_auth_cookies(response: Response, access: str, refresh: str) -> None:
    """Attach the access and refresh tokens to the response as httpOnly cookies."""

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
    """Remove the access and refresh token cookies from the client."""

    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")


class UserRegistrationView(APIView):
    """Register a new LavernaEvents user."""

    permission_classes = [AllowAny]

    def post(self, request):
        """Create a new user account."""

        serializer = UserRegistrationSerializer(
            data=request.data
        )

        if not serializer.is_valid():
            return Response(
                {
                    "success": False,
                    "message": "Registration failed.",
                    "errors": serializer.errors,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        user = serializer.save()

        send_verification_otp(user)

        return Response(
            {
                "success": True,
                "message": (
                    "User registered successfully. "
                    "A verification code has been sent to your mobile number."
                ),
                "data": {
                    "id": user.id,
                    "full_name": user.full_name,
                    "email": user.email,
                    "mobile_number": user.mobile_number,
                    "role": user.role,
                    "is_verified": user.is_verified,
                    "is_active": user.is_active,
                },
            },
            status=status.HTTP_201_CREATED,
        )


class UserLoginView(APIView):
    """Authenticate a user using mobile number and password."""

    permission_classes = [AllowAny]

    def post(self, request):
        """Validate credentials and return JWT tokens."""

        serializer = UserLoginSerializer(
            data=request.data
        )

        try:
            serializer.is_valid(raise_exception=True)
        except AuthenticationFailed:
            return Response(
                {
                    "success": False,
                    "message": "Invalid mobile number or password.",
                    "errors": {
                        "authentication": [
                            "Invalid credentials."
                        ]
                    },
                },
                status=status.HTTP_401_UNAUTHORIZED,
            )
        except serializers.ValidationError as error:
            # Raised by UserLoginSerializer.validate() for a suspended
            # account. DRF's ValidationError.detail can be a list, dict,
            # or ErrorDetail depending on how it was raised - normalizing
            # to a flat string keeps this response shape consistent with
            # every other error response in the app.
            detail = error.detail
            if isinstance(detail, list):
                message = str(detail[0])
            elif isinstance(detail, dict):
                message = str(next(iter(detail.values()))[0])
            else:
                message = str(detail)

            return Response(
                {
                    "success": False,
                    "message": message,
                    "errors": {"account": [message]},
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        response = Response(
            {
                "success": True,
                "message": "Login successful.",
                "data": {
                    "user": serializer.validated_data["user"],
                },
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
    """Generate a new access token from a refresh token."""

    permission_classes = [AllowAny]

    def post(self, request):
        """Refresh the user's access token."""

        refresh_token = request.COOKIES.get("refresh_token")

        if not refresh_token:
            return Response(
                {
                    "success": False,
                    "message": "Token refresh failed.",
                    "errors": {
                        "refresh": [
                            "No refresh token cookie was found."
                        ]
                    },
                },
                status=status.HTTP_401_UNAUTHORIZED,
            )

        serializer = UserTokenRefreshSerializer(
            data={"refresh": refresh_token}
        )

        if not serializer.is_valid():
            return Response(
                {
                    "success": False,
                    "message": "Token refresh failed.",
                    "errors": serializer.errors,
                },
                status=status.HTTP_401_UNAUTHORIZED,
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
    """Logout a user by blacklisting their refresh token."""

    permission_classes = [AllowAny]

    def post(self, request):
        """Blacklist the refresh token found in the request cookies."""

        refresh_token = request.COOKIES.get("refresh_token")

        if refresh_token:
            try:
                token = RefreshToken(refresh_token)
                token.blacklist()

            except TokenError:
                pass

        response = Response(
            {
                "success": True,
                "message": "Logout successful.",
                "data": {},
            },
            status=status.HTTP_200_OK,
        )

        _clear_auth_cookies(response)

        return response


class ForgotPasswordView(APIView):
    """Request a password reset link to be sent by email."""

    permission_classes = [AllowAny]

    def post(self, request):
        """Generate a reset link and email it, without revealing account existence."""

        serializer = ForgotPasswordSerializer(
            data=request.data
        )

        if not serializer.is_valid():
            return Response(
                {
                    "success": False,
                    "message": "Invalid request.",
                    "errors": serializer.errors,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        email = serializer.validated_data["email"]

        user = User.objects.filter(
            email__iexact=email
        ).first()

        if user is not None:
            uid = urlsafe_base64_encode(
                force_bytes(user.pk)
            )

            token_generator = PasswordResetTokenGenerator()
            token = token_generator.make_token(user)

            frontend_url = config(
                "FRONTEND_RESET_PASSWORD_URL",
                default="http://localhost:5173/reset-password",
            )

            reset_link = f"{frontend_url}?uid={uid}&token={token}"

            send_mail(
                subject="Reset your LavernaEvents password",
                message=(
                    f"Hello {user.full_name},\n\n"
                    "We received a request to reset your LavernaEvents password.\n"
                    f"Click the link below to set a new password:\n\n{reset_link}\n\n"
                    "If you did not request this, please ignore this email."
                ),
                from_email=None,
                recipient_list=[user.email],
                fail_silently=True,
            )

        return Response(
            {
                "success": True,
                "message": (
                    "If an account with that email exists, "
                    "a password reset link has been sent."
                ),
                "data": {},
            },
            status=status.HTTP_200_OK,
        )


class ResetPasswordView(APIView):
    """Confirm a password reset using the uid and token from the email link."""

    permission_classes = [AllowAny]

    def post(self, request):
        """Validate the reset token and set the new password."""

        serializer = ResetPasswordSerializer(
            data=request.data
        )

        if not serializer.is_valid():
            return Response(
                {
                    "success": False,
                    "message": "Password reset failed.",
                    "errors": serializer.errors,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer.save()

        return Response(
            {
                "success": True,
                "message": "Password reset successfully. You can now log in.",
                "data": {},
            },
            status=status.HTTP_200_OK,
        )


class VerifyMobileView(APIView):
    """Confirm a user's mobile number using a one-time code."""

    permission_classes = [AllowAny]

    def post(self, request):
        """Validate the OTP code and mark the user's mobile number as verified."""

        serializer = VerifyMobileSerializer(data=request.data)

        if not serializer.is_valid():
            return Response(
                {
                    "success": False,
                    "message": "Invalid request.",
                    "errors": serializer.errors,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        success, message = verify_otp_code(
            mobile_number=serializer.validated_data["mobile_number"],
            code=serializer.validated_data["code"],
        )

        if not success:
            return Response(
                {
                    "success": False,
                    "message": message,
                    "errors": {"code": [message]},
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response(
            {
                "success": True,
                "message": message,
                "data": {},
            },
            status=status.HTTP_200_OK,
        )


class ResendOTPView(APIView):
    """Resend a fresh mobile verification OTP."""

    permission_classes = [AllowAny]

    def post(self, request):
        """Generate and send a new OTP if the account exists and is unverified."""

        serializer = ResendOTPSerializer(data=request.data)

        if not serializer.is_valid():
            return Response(
                {
                    "success": False,
                    "message": "Invalid request.",
                    "errors": serializer.errors,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        mobile_number = serializer.validated_data["mobile_number"]

        user = User.objects.filter(mobile_number=mobile_number).first()

        if user is not None and not user.is_verified:
            send_verification_otp(user)

        return Response(
            {
                "success": True,
                "message": (
                    "If an unverified account with that mobile number exists, "
                    "a new verification code has been sent."
                ),
                "data": {},
            },
            status=status.HTTP_200_OK,
        )


class UserMeView(APIView):
    """Return the currently authenticated user."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        """Return the requesting user's profile."""

        user = request.user

        return Response(
            {
                "success": True,
                "message": "Current user retrieved successfully.",
                "data": {
                    "id": user.id,
                    "full_name": user.full_name,
                    "email": user.email,
                    "mobile_number": user.mobile_number,
                    "role": user.role,
                    "is_verified": user.is_verified,
                    "is_active": user.is_active,
                },
            },
            status=status.HTTP_200_OK,
        )