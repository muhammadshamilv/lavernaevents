"""Settings for running the test suite. NEVER touches the real database or
any real provider.

    python manage.py test --settings=config.test_settings

What it does:
* Uses a throwaway SQLite database, whatever DB_* says in .env.
* Blanks every provider key (Brevo, Fast2SMS, Plivo, Twilio, Supabase
  storage, Redis) BEFORE the main settings are read. python-decouple reads
  real environment variables before backend/.env, so these blanks win over
  anything in .env. Code that reads a key at runtime with decouple.config()
  sees the blank too, so every sender reports "not configured" instead of
  calling out. Tests that exercise a sender mock it explicitly.
* Cashfree gets obvious sandbox placeholder values (tests mock the HTTP
  calls; the placeholders only let the code path run).
* Points HTTP(S)_PROXY at a closed local port as a last safety net: a test
  that forgets to mock a provider fails loudly instead of reaching it.
"""

import os
import tempfile

_FORCED_ENV = {
    # Database: dummy values only so config.settings can be imported; the
    # DATABASES setting is replaced below.
    "DB_NAME": "unused",
    "DB_USER": "unused",
    "DB_PASSWORD": "unused",
    "DB_HOST": "localhost",
    "DB_PORT": "5432",
    "DJANGO_SECRET_KEY": "test-only-secret-key-not-for-production",
    "DJANGO_DEBUG": "True",
    "SECURE_SSL_REDIRECT": "False",
    # Outside services: all off.
    "OTP_DELIVERY": "console",
    "SMS_PROVIDER": "fast2sms",
    "FAST2SMS_API_KEY": "",
    "BREVO_API_KEY": "",
    "EMAIL_HOST": "",
    "AWS_STORAGE_BUCKET_NAME": "",
    "REDIS_URL": "",
    "PLIVO_AUTH_ID": "",
    "PLIVO_AUTH_TOKEN": "",
    "PLIVO_FROM_NUMBER": "",
    "TWILIO_ACCOUNT_SID": "",
    "TWILIO_AUTH_TOKEN": "",
    "TWILIO_FROM_NUMBER": "",
    "TWILIO_SMS_FROM_NUMBER": "",
    "PUBLIC_BACKEND_URL": "",
    "PROXY_SHARED_SECRET": "",
    "CASHFREE_ENV": "sandbox",
    "CASHFREE_APP_ID": "sandbox-test-app-id",
    "CASHFREE_SECRET_KEY": "sandbox-test-secret",
    "CELERY_BROKER_URL": "memory://",
    "CELERY_RESULT_BACKEND": "cache+memory://",
    # Network safety net (see module docstring).
    "HTTP_PROXY": "http://127.0.0.1:9",
    "HTTPS_PROXY": "http://127.0.0.1:9",
    "http_proxy": "http://127.0.0.1:9",
    "https_proxy": "http://127.0.0.1:9",
    "NO_PROXY": "",
    "no_proxy": "",
}

os.environ.update(_FORCED_ENV)

from .settings import *  # noqa: E402,F401,F403
from .settings import BASE_DIR  # noqa: E402

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        # The test runner creates its own in-memory test database from this.
        "NAME": BASE_DIR / "test_db.sqlite3",
    }
}

CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
        "LOCATION": "laverna-tests",
    }
}

EMAIL_BACKEND = "django.core.mail.backends.locmem.EmailBackend"

STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {
        "BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage",
    },
}

# Uploaded test files go to a temporary folder, never backend/media/.
MEDIA_ROOT = tempfile.mkdtemp(prefix="laverna-test-media-")

CELERY_TASK_ALWAYS_EAGER = True

PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]
