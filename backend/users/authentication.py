from rest_framework.exceptions import AuthenticationFailed
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError


class CookieJWTAuthentication(JWTAuthentication):
    """JWT authentication that reads the access token from an httpOnly cookie.

    Falls back to the standard `Authorization: Bearer <token>` header so
    existing tooling (API tests, Postman) keeps working unchanged.

    A stale, expired or malformed cookie, a token for a user that no
    longer exists, and a suspended user are all treated as "not logged
    in" (return None) instead of failing the request. Otherwise one old
    cookie would turn every request, even public AllowAny pages such as
    login, register and the guest response page, into a 401.
    """

    def authenticate(self, request):
        header = self.get_header(request)

        if header is not None:
            raw_token = self.get_raw_token(header)
        else:
            raw_token = request.COOKIES.get("access_token")

        if raw_token is None:
            return None

        try:
            validated_token = self.get_validated_token(raw_token)
            user = self.get_user(validated_token)
        except (InvalidToken, TokenError, AuthenticationFailed):
            return None

        # Suspending a user takes effect on their very next request, not
        # when the access token finally expires.
        if getattr(user, "is_suspended", False):
            return None

        return user, validated_token
