"""
Django settings for LavernaEvents.

Backend:  Django 6.x
Database: PostgreSQL

Every deployment-specific value comes from environment variables.
python-decouple reads real environment variables first and then
backend/.env, so this one file runs unchanged locally and on Render.
"""

from datetime import timedelta
from pathlib import Path

from decouple import Csv, config
from django.core.exceptions import ImproperlyConfigured

# --------------------------------------------------
# Base Directory
# --------------------------------------------------

BASE_DIR = Path(__file__).resolve().parent.parent

# --------------------------------------------------
# Security
# --------------------------------------------------

SECRET_KEY = config(
    "DJANGO_SECRET_KEY",
    default="django-insecure-development-only-change-this",
)

# Secure by default: a deployment that forgets to set DJANGO_DEBUG runs in
# production mode. Local development sets DJANGO_DEBUG=True in backend/.env.
DEBUG = config("DJANGO_DEBUG", default=False, cast=bool)

if not DEBUG and SECRET_KEY.startswith(("django-insecure", "replace-this")):
    raise ImproperlyConfigured(
        "DJANGO_SECRET_KEY must be set to a real secret when DJANGO_DEBUG is False."
    )

ALLOWED_HOSTS = config(
    "DJANGO_ALLOWED_HOSTS",
    default="localhost,127.0.0.1",
    cast=Csv(),
)

# Render injects the service's public hostname automatically.
RENDER_EXTERNAL_HOSTNAME = config("RENDER_EXTERNAL_HOSTNAME", default="")

if RENDER_EXTERNAL_HOSTNAME and RENDER_EXTERNAL_HOSTNAME not in ALLOWED_HOSTS:
    ALLOWED_HOSTS.append(RENDER_EXTERNAL_HOSTNAME)

# --------------------------------------------------
# Installed Apps
# --------------------------------------------------

INSTALLED_APPS = [
    # Django Apps
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",

    # Third Party
    "corsheaders",
    "rest_framework",
    "rest_framework_simplejwt",
    "rest_framework_simplejwt.token_blacklist",
    "django_filters",

    # Local Apps
    "common",
    "users",
    "memberships",
    "payments",
    "events",
    "guests",
    "invitations",
    "notifications",
    "responses",
    "gallery",
    "photographers",
    "dashboard",
    "qr_codes",
    "admin_panel",
]

# --------------------------------------------------
# Middleware
# --------------------------------------------------

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "common.middleware.RejectNullBytesMiddleware",
    # Serves the collected static files (Django admin CSS/JS) in production.
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

# Django admin lives at /<DJANGO_ADMIN_URL>/ (see config/urls.py). Set it to
# something non-obvious in production, e.g. "manage-7f3k/".
DJANGO_ADMIN_URL = config("DJANGO_ADMIN_URL", default="admin/").strip("/") + "/"

# --------------------------------------------------
# URLs
# --------------------------------------------------

ROOT_URLCONF = "config.urls"

# --------------------------------------------------
# Templates
# --------------------------------------------------

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"

# --------------------------------------------------
# Database
# --------------------------------------------------
# Local:    DB_SSLMODE is unset (libpq default "prefer").
# Supabase: DB_HOST is the Supavisor *session pooler* host
#           (aws-0-<region>.pooler.supabase.com), DB_USER is
#           postgres.<project-ref>, DB_PORT is 5432, DB_SSLMODE=require.

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": config("DB_NAME"),
        "USER": config("DB_USER"),
        "PASSWORD": config("DB_PASSWORD"),
        "HOST": config("DB_HOST"),
        "PORT": config("DB_PORT", cast=int),
        "CONN_MAX_AGE": config("DB_CONN_MAX_AGE", default=0, cast=int),
        "OPTIONS": {
            "sslmode": config("DB_SSLMODE", default="prefer"),
        },
    }
}

# --------------------------------------------------
# Password Validation
# --------------------------------------------------

AUTH_PASSWORD_VALIDATORS = [
    {
        "NAME": (
            "django.contrib.auth.password_validation."
            "UserAttributeSimilarityValidator"
        ),
    },
    {
        "NAME": (
            "django.contrib.auth.password_validation."
            "MinimumLengthValidator"
        ),
        "OPTIONS": {
            "min_length": 8,
        },
    },
    {
        "NAME": (
            "django.contrib.auth.password_validation."
            "CommonPasswordValidator"
        ),
    },
    {
        "NAME": (
            "django.contrib.auth.password_validation."
            "NumericPasswordValidator"
        ),
    },
]

AUTH_USER_MODEL = "users.User"

# --------------------------------------------------
# Internationalization
# --------------------------------------------------

LANGUAGE_CODE = "en-us"

TIME_ZONE = "Asia/Kolkata"

USE_I18N = True

USE_TZ = True

# --------------------------------------------------
# Static & Media
# --------------------------------------------------

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "media"

# Media storage.
#   - AWS_STORAGE_BUCKET_NAME empty  -> files go to the local media/ folder
#     (fine for development; on Render's free plan the disk is wiped on
#     every restart, so uploads would be lost).
#   - AWS_STORAGE_BUCKET_NAME set    -> files go to an S3-compatible bucket
#     (Supabase Storage by default; Cloudflare R2 works the same way by
#     overriding AWS_S3_ENDPOINT_URL / AWS_S3_CUSTOM_DOMAIN).

AWS_STORAGE_BUCKET_NAME = config("AWS_STORAGE_BUCKET_NAME", default="")
USE_S3_MEDIA = bool(AWS_STORAGE_BUCKET_NAME)

if USE_S3_MEDIA:
    SUPABASE_PROJECT_REF = config("SUPABASE_PROJECT_REF", default="")

    AWS_ACCESS_KEY_ID = config("AWS_ACCESS_KEY_ID")
    AWS_SECRET_ACCESS_KEY = config("AWS_SECRET_ACCESS_KEY")
    AWS_S3_REGION_NAME = config("AWS_S3_REGION_NAME", default="us-east-1")

    AWS_S3_ENDPOINT_URL = config(
        "AWS_S3_ENDPOINT_URL",
        default=(
            f"https://{SUPABASE_PROJECT_REF}.storage.supabase.co/storage/v1/s3"
            if SUPABASE_PROJECT_REF
            else ""
        ),
    )

    # Public URL prefix for files in a PUBLIC bucket.
    AWS_S3_CUSTOM_DOMAIN = (
        config(
            "AWS_S3_CUSTOM_DOMAIN",
            default=(
                f"{SUPABASE_PROJECT_REF}.supabase.co/storage/v1/object/public/"
                f"{AWS_STORAGE_BUCKET_NAME}"
                if SUPABASE_PROJECT_REF
                else ""
            ),
        )
        or None
    )

    AWS_S3_SIGNATURE_VERSION = "s3v4"
    AWS_S3_ADDRESSING_STYLE = "path"
    AWS_QUERYSTRING_AUTH = False
    AWS_S3_FILE_OVERWRITE = False
    AWS_DEFAULT_ACL = None

    _default_storage = "storages.backends.s3.S3Storage"
else:
    _default_storage = "django.core.files.storage.FileSystemStorage"

STORAGES = {
    "default": {"BACKEND": _default_storage},
    "staticfiles": {
        "BACKEND": (
            "django.contrib.staticfiles.storage.StaticFilesStorage"
            if DEBUG
            else "whitenoise.storage.CompressedManifestStaticFilesStorage"
        ),
    },
}

# --------------------------------------------------
# Default Primary Key
# --------------------------------------------------

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# --------------------------------------------------
# CORS / CSRF
# --------------------------------------------------
# In production the browser talks to the API through the Cloudflare Pages
# proxy (same origin), so CORS is not even used. These are kept for local
# development and as a fallback.

CORS_ALLOWED_ORIGINS = config(
    "CORS_ALLOWED_ORIGINS",
    default="http://localhost:5173,http://127.0.0.1:5173",
    cast=Csv(),
)

CORS_ALLOW_CREDENTIALS = True

CSRF_TRUSTED_ORIGINS = config(
    "CSRF_TRUSTED_ORIGINS",
    default="",
    cast=Csv(),
)

if RENDER_EXTERNAL_HOSTNAME:
    _render_origin = f"https://{RENDER_EXTERNAL_HOSTNAME}"
    if _render_origin not in CSRF_TRUSTED_ORIGINS:
        CSRF_TRUSTED_ORIGINS.append(_render_origin)

# --------------------------------------------------
# Django REST Framework
# --------------------------------------------------

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "users.authentication.CookieJWTAuthentication",
    ),

    "DEFAULT_PERMISSION_CLASSES": (
        "rest_framework.permissions.IsAuthenticated",
    ),

    "DEFAULT_FILTER_BACKENDS": (
        "django_filters.rest_framework.DjangoFilterBackend",
    ),

    "DEFAULT_PAGINATION_CLASS": (
        "common.pagination.StandardResultsPagination"
    ),

    "PAGE_SIZE": 20,

    "EXCEPTION_HANDLER": (
        "common.exceptions.custom_exception_handler"
    ),

    # Rate limiting: see common/throttling.py for which view gets which rule.
    "DEFAULT_THROTTLE_CLASSES": (
        "common.throttling.RouteThrottle",
    ),
    "DEFAULT_THROTTLE_RATES": {
        # Catch-all limits per client IP (anonymous) / per user (signed in).
        "anon": config("THROTTLE_ANON", default="120/min"),
        "user": config("THROTTLE_USER", default="600/min"),
        # Auth endpoints (per IP).
        "login": config("THROTTLE_LOGIN", default="10/min"),
        "register": config("THROTTLE_REGISTER", default="10/hour"),
        "otp": config("THROTTLE_OTP", default="10/min"),
        "password_reset": config("THROTTLE_PASSWORD_RESET", default="5/hour"),
        "refresh": config("THROTTLE_REFRESH", default="60/min"),
        # Per mobile number, so many IPs cannot hammer one account.
        "login_ident": config("THROTTLE_LOGIN_IDENT", default="10/10min"),
        "otp_ident": config("THROTTLE_OTP_IDENT", default="20/hour"),
        "password_reset_ident": config("THROTTLE_PASSWORD_RESET_IDENT", default="5/hour"),
        # Public guest pages (per IP).
        "guest_public": config("THROTTLE_GUEST_PUBLIC", default="60/min"),
        "selfie": config("THROTTLE_SELFIE", default="6/min"),
        "selfie_hour": config("THROTTLE_SELFIE_HOUR", default="40/hour"),
        "download": config("THROTTLE_DOWNLOAD", default="60/min"),
        # Signed-in organiser actions that cost money or CPU (per user).
        "upload": config("THROTTLE_UPLOAD", default="30/min"),
        "send": config("THROTTLE_SEND", default="30/min"),
    },
}

if not DEBUG:
    # No browsable API in production: JSON only.
    REST_FRAMEWORK["DEFAULT_RENDERER_CLASSES"] = (
        "rest_framework.renderers.JSONRenderer",
    )

# --------------------------------------------------
# Client IP / proxy trust (used by rate limiting)
# --------------------------------------------------
# Production path:  browser -> Cloudflare Pages Function -> Render -> Django.
# Django only ever sees Cloudflare's servers, so the Pages Function forwards
# the real visitor IP in X-Client-IP together with a shared secret. Django
# trusts X-Client-IP ONLY when that secret matches, so nobody can fake their
# IP by calling the Render URL directly.
#   Pages:  PROXY_SHARED_SECRET  (Variables and Secrets)
#   Render: PROXY_SHARED_SECRET  (same value)
PROXY_SHARED_SECRET = config("PROXY_SHARED_SECRET", default="")

# Fallback when the secret is not set: how many reverse proxies sit in front
# of Django (Render adds one). 0 = trust nothing, use the socket address.
TRUSTED_PROXY_COUNT = config("TRUSTED_PROXY_COUNT", default=0 if DEBUG else 1, cast=int)

# --------------------------------------------------
# Cache (rate-limit counters live here)
# --------------------------------------------------
# Without REDIS_URL each gunicorn worker counts separately, so the effective
# limit is (rate x workers). Fine for one worker; set REDIS_URL (Render Key
# Value / Upstash) to share the counters between workers and restarts.

REDIS_URL = config("REDIS_URL", default="")

if REDIS_URL:
    CACHES = {
        "default": {
            "BACKEND": "django.core.cache.backends.redis.RedisCache",
            "LOCATION": REDIS_URL,
        }
    }
else:
    CACHES = {
        "default": {
            "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
            "LOCATION": "laverna-default",
        }
    }

# --------------------------------------------------
# Upload limits
# --------------------------------------------------
# Form fields / JSON bodies (files are NOT counted here).
DATA_UPLOAD_MAX_MEMORY_SIZE = 2 * 1024 * 1024
# Uploads bigger than this are streamed to a temp file instead of RAM.
FILE_UPLOAD_MAX_MEMORY_SIZE = 5 * 1024 * 1024

# --------------------------------------------------
# JWT
# --------------------------------------------------

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(
        minutes=config(
            "JWT_ACCESS_TOKEN_MINUTES",
            default=15,
            cast=int,
        )
    ),
    "REFRESH_TOKEN_LIFETIME": timedelta(
        days=config(
            "JWT_REFRESH_TOKEN_DAYS",
            default=7,
            cast=int,
        )
    ),
    "AUTH_HEADER_TYPES": ("Bearer",),
    "UPDATE_LAST_LOGIN": True,
    "BLACKLIST_AFTER_ROTATION": True,
}

# --------------------------------------------------
# Auth Cookies
# --------------------------------------------------

AUTH_COOKIE_SECURE = config(
    "AUTH_COOKIE_SECURE",
    default=not DEBUG,
    cast=bool,
)

AUTH_COOKIE_SAMESITE = config(
    "AUTH_COOKIE_SAMESITE",
    default="Lax",
)

# --------------------------------------------------
# Production security (only when DEBUG is False)
# --------------------------------------------------

if not DEBUG:
    # Render terminates TLS and forwards the original scheme in this header.
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
    SECURE_SSL_REDIRECT = config("SECURE_SSL_REDIRECT", default=True, cast=bool)
    SECURE_REDIRECT_EXEMPT = [r"^api/health/$"]

    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True

    SECURE_CONTENT_TYPE_NOSNIFF = True
    SECURE_REFERRER_POLICY = "same-origin"
    SECURE_CROSS_ORIGIN_OPENER_POLICY = "same-origin"
    X_FRAME_OPTIONS = "DENY"

    # Leave 0 while on *.onrender.com / *.pages.dev. Raise it (for example
    # 31536000) only once you are on your own domain with HTTPS everywhere.
    SECURE_HSTS_SECONDS = config("SECURE_HSTS_SECONDS", default=0, cast=int)
    SECURE_HSTS_INCLUDE_SUBDOMAINS = SECURE_HSTS_SECONDS > 0
    SECURE_HSTS_PRELOAD = False

# --------------------------------------------------
# Email
# --------------------------------------------------
# Priority:
#   1. BREVO_API_KEY set  -> real email over Brevo's HTTPS API (works on
#      Render's free plan, which blocks SMTP ports 25/465/587).
#   2. EMAIL_HOST set     -> plain SMTP (fine locally, e.g. Gmail).
#   3. otherwise          -> emails are only printed to the server log.

BREVO_API_KEY = config("BREVO_API_KEY", default="")
EMAIL_HOST = config("EMAIL_HOST", default="")

if BREVO_API_KEY:
    INSTALLED_APPS.append("anymail")
    EMAIL_BACKEND = "anymail.backends.brevo.EmailBackend"
    ANYMAIL = {"BREVO_API_KEY": BREVO_API_KEY}
elif EMAIL_HOST:
    EMAIL_BACKEND = "django.core.mail.backends.smtp.EmailBackend"
    EMAIL_PORT = config("EMAIL_PORT", default=587, cast=int)
    EMAIL_HOST_USER = config("EMAIL_HOST_USER", default="")
    EMAIL_HOST_PASSWORD = config("EMAIL_HOST_PASSWORD", default="")
    EMAIL_USE_TLS = config("EMAIL_USE_TLS", default=True, cast=bool)
else:
    EMAIL_BACKEND = "django.core.mail.backends.console.EmailBackend"

# Must be an address/domain verified with your email provider.
DEFAULT_FROM_EMAIL = config("DEFAULT_FROM_EMAIL", default="noreply@lavernaevents.com")

# --------------------------------------------------
# Application / integration settings
# --------------------------------------------------

FRONTEND_URL = config("FRONTEND_URL", default="http://localhost:5173")
FRONTEND_BASE_URL = config("FRONTEND_BASE_URL", default=FRONTEND_URL)
FRONTEND_GUEST_RESPONSE_URL = config(
    "FRONTEND_GUEST_RESPONSE_URL",
    default=f"{FRONTEND_URL.rstrip('/')}/respond",
)

DEFAULT_COUNTRY_CODE = config("DEFAULT_COUNTRY_CODE", default="91")

# Public address of THIS backend (used in invitation image links and for
# Twilio voice callbacks). On Render this is your https://<name>.onrender.com URL.
PUBLIC_BACKEND_URL = config("PUBLIC_BACKEND_URL", default="")

STRIPE_SECRET_KEY = config("STRIPE_SECRET_KEY", default="")
STRIPE_PUBLISHABLE_KEY = config("STRIPE_PUBLISHABLE_KEY", default="")
STRIPE_WEBHOOK_SECRET = config("STRIPE_WEBHOOK_SECRET", default="")

TWILIO_ACCOUNT_SID = config("TWILIO_ACCOUNT_SID", default="")
TWILIO_AUTH_TOKEN = config("TWILIO_AUTH_TOKEN", default="")
TWILIO_FROM_NUMBER = config("TWILIO_FROM_NUMBER", default="")
TWILIO_SMS_FROM_NUMBER = config("TWILIO_SMS_FROM_NUMBER", default="")

# --------------------------------------------------
# Celery
# --------------------------------------------------

CELERY_BROKER_URL = config("CELERY_BROKER_URL", default="redis://localhost:6379/0")
CELERY_RESULT_BACKEND = config("CELERY_RESULT_BACKEND", default="redis://localhost:6379/0")
CELERY_ACCEPT_CONTENT = ["json"]
CELERY_TASK_SERIALIZER = "json"
CELERY_RESULT_SERIALIZER = "json"
CELERY_TIMEZONE = TIME_ZONE

# --------------------------------------------------
# Logging
# --------------------------------------------------
# With DEBUG=False Django would otherwise swallow tracebacks. This sends
# them to stdout, which is what Render's "Logs" tab shows.

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "simple": {"format": "%(asctime)s %(levelname)s %(name)s: %(message)s"},
    },
    "handlers": {
        "console": {"class": "logging.StreamHandler", "formatter": "simple"},
    },
    "root": {
        "handlers": ["console"],
        "level": config("DJANGO_LOG_LEVEL", default="INFO"),
    },
    "loggers": {
        "django.request": {
            "handlers": ["console"],
            "level": "ERROR",
            "propagate": False,
        },
    },
}