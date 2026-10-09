"""Phase 14 tests: rate limiting, client IP, validators, permission audit.

Run:  python manage.py test common
"""

import io

from django.core.cache import cache
from django.core.exceptions import ValidationError
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import SimpleTestCase, override_settings
from django.urls import URLPattern, URLResolver, get_resolver
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.test import APIRequestFactory
from rest_framework.views import APIView

from common.throttling import RouteThrottle, get_client_ip, parse_rate
from common.validators import validate_image_content

RATES = {
    "DEFAULT_THROTTLE_RATES": {
        "anon": "1000/min",
        "user": "1000/min",
        "login": "3/min",
        "login_ident": "2/10min",
    },
    "EXCEPTION_HANDLER": "common.exceptions.custom_exception_handler",
}


class _LoginLike(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_classes = [RouteThrottle]
    throttle_rules = (("login", "ip"), ("login_ident", "ident"))

    def post(self, request):
        return Response({"ok": True})


class _Webhook(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_classes = [RouteThrottle]

    def post(self, request):
        return Response({"ok": True})


_Webhook.__name__ = "StripeWebhookView"

CACHES = {"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache", "LOCATION": "t"}}


@override_settings(REST_FRAMEWORK=RATES, CACHES=CACHES, PROXY_SHARED_SECRET="s3cret", TRUSTED_PROXY_COUNT=1)
class ThrottleTests(SimpleTestCase):
    def setUp(self):
        cache.clear()
        self.factory = APIRequestFactory()

    def _post(self, view, ip="1.1.1.1", mobile="9876543210"):
        request = self.factory.post(
            "/x/",
            {"mobile_number": mobile},
            format="json",
            HTTP_X_CLIENT_IP=ip,
            HTTP_X_PROXY_SECRET="s3cret",
        )
        return view.as_view()(request)

    def test_ip_limit_blocks_after_rate(self):
        codes = [self._post(_LoginLike, mobile=f"90000000{i:02d}").status_code for i in range(5)]
        self.assertEqual(codes, [200, 200, 200, 429, 429])

    def test_other_ip_not_affected(self):
        for i in range(4):
            self._post(_LoginLike, mobile=f"90000000{i:02d}")
        self.assertEqual(self._post(_LoginLike, ip="2.2.2.2", mobile="9111111111").status_code, 200)

    def test_same_mobile_from_many_ips_is_blocked(self):
        codes = [self._post(_LoginLike, ip=f"3.3.3.{i}").status_code for i in range(1, 5)]
        self.assertEqual(codes, [200, 200, 429, 429])

    def test_mobile_format_does_not_bypass(self):
        self._post(_LoginLike, ip="4.4.4.1", mobile="9876543210")
        self._post(_LoginLike, ip="4.4.4.2", mobile="+91 98765 43210")
        self.assertEqual(self._post(_LoginLike, ip="4.4.4.3", mobile="09876543210").status_code, 429)

    def test_throttled_response_shape(self):
        for i in range(3):
            self._post(_LoginLike, mobile=f"90000000{i:02d}")
        response = self._post(_LoginLike, mobile="9222222222")
        response.render()
        self.assertEqual(response.status_code, 429)
        self.assertFalse(response.data["success"])
        self.assertIn("Too many requests", response.data["message"])
        self.assertGreaterEqual(response.data["retry_after"], 1)

    def test_webhooks_are_exempt(self):
        codes = {self._post(_Webhook).status_code for _ in range(20)}
        self.assertEqual(codes, {200})

    def _post_body(self, body, ip):
        request = self.factory.post(
            "/x/", body, format="json", HTTP_X_CLIENT_IP=ip, HTTP_X_PROXY_SECRET="s3cret"
        )
        return _LoginLike.as_view()(request)

    def test_identifier_field_counts_against_the_same_account(self):
        # The forgot / reset password forms send "identifier" (or "email")
        # instead of "mobile_number"; the per-account limit must still apply.
        self._post_body({"identifier": "9876543210"}, "5.5.5.1")
        self._post_body({"mobile_number": "+91 98765 43210"}, "5.5.5.2")
        self.assertEqual(self._post_body({"identifier": "09876543210"}, "5.5.5.3").status_code, 429)

    def test_email_identifier_is_throttled_per_account(self):
        codes = [
            self._post_body({key: value}, f"6.6.6.{i}").status_code
            for i, (key, value) in enumerate(
                [("email", "a@example.com"), ("identifier", " A@Example.com "), ("email", "a@example.com")]
            )
        ]
        self.assertEqual(codes, [200, 200, 429])


@override_settings(PROXY_SHARED_SECRET="s3cret", TRUSTED_PROXY_COUNT=1)
class ClientIpTests(SimpleTestCase):
    def setUp(self):
        self.factory = APIRequestFactory()

    def _ip(self, **meta):
        return get_client_ip(self.factory.get("/", **meta))

    def test_trusts_header_with_correct_secret(self):
        self.assertEqual(self._ip(HTTP_X_CLIENT_IP="9.9.9.9", HTTP_X_PROXY_SECRET="s3cret"), "9.9.9.9")

    def test_ignores_header_with_wrong_secret(self):
        ip = self._ip(HTTP_X_CLIENT_IP="9.9.9.9", HTTP_X_PROXY_SECRET="nope", HTTP_X_FORWARDED_FOR="7.7.7.7")
        self.assertEqual(ip, "7.7.7.7")

    def test_ignores_header_without_secret(self):
        self.assertEqual(self._ip(HTTP_X_CLIENT_IP="9.9.9.9", REMOTE_ADDR="5.5.5.5", HTTP_X_FORWARDED_FOR=""), "5.5.5.5")

    def test_forwarded_for_uses_rightmost_trusted_hop(self):
        # A client forging the left side cannot change the proxy-appended value.
        self.assertEqual(self._ip(HTTP_X_FORWARDED_FOR="6.6.6.6, 8.8.8.8"), "8.8.8.8")

    def test_garbage_ip_is_rejected(self):
        self.assertEqual(
            self._ip(HTTP_X_CLIENT_IP="not-an-ip", HTTP_X_PROXY_SECRET="s3cret", REMOTE_ADDR="5.5.5.5", HTTP_X_FORWARDED_FOR=""),
            "5.5.5.5",
        )

    @override_settings(PROXY_SHARED_SECRET="", TRUSTED_PROXY_COUNT=0)
    def test_no_trust_uses_socket_address(self):
        self.assertEqual(self._ip(REMOTE_ADDR="5.5.5.5", HTTP_X_FORWARDED_FOR="1.2.3.4"), "5.5.5.5")


class ParseRateTests(SimpleTestCase):
    def test_formats(self):
        self.assertEqual(parse_rate("10/min"), (10, 60))
        self.assertEqual(parse_rate("5/hour"), (5, 3600))
        self.assertEqual(parse_rate("10/10min"), (10, 600))
        self.assertEqual(parse_rate("3/day"), (3, 86400))
        self.assertIsNone(parse_rate("lots"))
        self.assertIsNone(parse_rate(None))


def _png_bytes():
    from PIL import Image

    buffer = io.BytesIO()
    Image.new("RGB", (4, 4), "red").save(buffer, format="PNG")
    return buffer.getvalue()


class ImageContentTests(SimpleTestCase):
    def test_real_png_passes(self):
        validate_image_content(SimpleUploadedFile("a.png", _png_bytes(), "image/png"))

    def test_html_renamed_to_jpg_fails(self):
        with self.assertRaises(ValidationError):
            validate_image_content(SimpleUploadedFile("a.jpg", b"<script>alert(1)</script>", "image/jpeg"))

    def test_gif_is_not_allowed(self):
        from PIL import Image

        buffer = io.BytesIO()
        Image.new("RGB", (2, 2)).save(buffer, format="GIF")
        with self.assertRaises(ValidationError):
            validate_image_content(SimpleUploadedFile("a.png", buffer.getvalue(), "image/png"))


# Every endpoint that anyone may call without logging in. Adding a new public
# endpoint must be a conscious decision: this test fails until it is listed
# here (and given a throttle rule in common/throttling.py if it is abusable).
EXPECTED_PUBLIC_VIEWS = {
    "UserRegistrationView", "UserLoginView", "UserTokenRefreshView", "UserLogoutView",
    "ForgotPasswordView", "ResetPasswordView", "VerifyMobileView", "ResendOTPView",
    "MembershipPlanListView", "MembershipPlanDetailView",
    "StripeWebhookView",
    "InvitationResponsePageView", "InvitationCalendarView",
    "ScannedEventView", "GuestSelfieMatchView", "GuestMediaDownloadView",
    "VoiceTwiMLView", "TwilioCallStatusCallbackView",
}


def _iter_view_classes(patterns):
    for pattern in patterns:
        if isinstance(pattern, URLResolver):
            yield from _iter_view_classes(pattern.url_patterns)
        elif isinstance(pattern, URLPattern):
            cls = getattr(pattern.callback, "cls", None)
            if cls is not None:
                yield cls


def _is_public(view_class):
    return any(
        isinstance(p, type) and issubclass(p, AllowAny) or p is AllowAny
        for p in getattr(view_class, "permission_classes", [])
    )


class PermissionAuditTests(SimpleTestCase):
    def setUp(self):
        self.views = {c for c in _iter_view_classes(get_resolver().url_patterns)}

    def test_public_endpoints_are_exactly_the_expected_set(self):
        public = {c.__name__ for c in self.views if _is_public(c)}
        self.assertEqual(
            public - EXPECTED_PUBLIC_VIEWS, set(),
            "New public (AllowAny) endpoint(s): review them, add a throttle rule, then list them here.",
        )

    def test_every_other_api_view_requires_authentication(self):
        for cls in self.views:
            if not cls.__module__.split(".")[0] in {
                "users", "memberships", "payments", "events", "guests", "invitations",
                "notifications", "responses", "gallery", "photographers", "dashboard",
                "qr_codes", "admin_panel",
            }:
                continue
            if _is_public(cls):
                continue
            perms = getattr(cls, "permission_classes", [])
            self.assertTrue(perms, f"{cls.__name__} has no permission classes")

    def test_admin_panel_views_require_admin_role(self):
        for cls in self.views:
            if cls.__module__.startswith("admin_panel"):
                names = [p.__name__ for p in cls.permission_classes]
                self.assertIn("IsAdminRole", names, f"{cls.__name__} is not admin-only")

    def test_global_throttle_is_installed(self):
        from django.conf import settings

        self.assertIn("common.throttling.RouteThrottle", settings.REST_FRAMEWORK["DEFAULT_THROTTLE_CLASSES"])


class BadRequestHardeningTests(SimpleTestCase):
    """Malformed URLs must answer 400, never 500."""

    def _through_middleware(self, path):
        from django.http import HttpResponse
        from django.test import RequestFactory

        from common.middleware import RejectNullBytesMiddleware

        return RejectNullBytesMiddleware(lambda request: HttpResponse("ok"))(RequestFactory().get(path))

    def test_nul_byte_in_path_is_rejected(self):
        self.assertEqual(self._through_middleware("/api/respond/%00/").status_code, 400)

    def test_nul_byte_in_query_string_is_rejected(self):
        self.assertEqual(self._through_middleware("/api/events/?search=a%00b").status_code, 400)

    def test_normal_urls_pass(self):
        self.assertEqual(self._through_middleware("/api/events/?search=100%25%20sure").status_code, 200)

    def test_middleware_is_installed(self):
        from django.conf import settings

        self.assertIn("common.middleware.RejectNullBytesMiddleware", settings.MIDDLEWARE)

    def test_too_many_parameters_is_a_400_not_a_crash(self):
        from django.core.exceptions import TooManyFieldsSent

        from common.exceptions import custom_exception_handler

        response = custom_exception_handler(TooManyFieldsSent("too many"), {"view": None})

        self.assertEqual(response.status_code, 400)
        self.assertFalse(response.data["success"])
