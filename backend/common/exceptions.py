import logging

from django.conf import settings
from django.core.exceptions import SuspiciousOperation
from rest_framework import status
from rest_framework.exceptions import Throttled
from rest_framework.response import Response
from rest_framework.views import exception_handler as drf_exception_handler

logger = logging.getLogger(__name__)


def _first_message(data) -> str:
    """Pull a readable sentence out of DRF's nested error data."""

    if isinstance(data, dict):
        if "detail" in data:
            return str(data["detail"])

        for value in data.values():
            message = _first_message(value)

            if message:
                return message

        return ""

    if isinstance(data, (list, tuple)):
        for value in data:
            message = _first_message(value)

            if message:
                return message

        return ""

    return str(data) if data else ""


def custom_exception_handler(exc, context):
    """Give every error the project's response shape:
    {"success": false, "message": "...", "errors": {...}}.

    * Errors DRF already handles (validation, permission, not found,
      throttled ...) are reshaped; the message is the first real reason
      instead of a vague "Request failed.".
    * A crash nobody handled returns the same JSON with HTTP 500 and is
      logged with its traceback, so the browser never receives an HTML
      error page. With DEBUG on, Django's own debug page is kept.
    """

    response = drf_exception_handler(exc, context)

    # Too many parameters, an oversized body etc. are the caller's mistake
    # (Django answers 400 for these itself), not a crash on our side.
    if response is None and isinstance(exc, SuspiciousOperation):
        return Response(
            {
                "success": False,
                "message": "Invalid request.",
                "errors": {"detail": ["The request could not be processed."]},
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    if response is None:
        if settings.DEBUG:
            return None

        logger.exception("Unhandled error in %s", context.get("view"))

        return Response(
            {
                "success": False,
                "message": "Something went wrong on our side. Please try again.",
                "errors": {"detail": ["Internal server error."]},
            },
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    if isinstance(exc, Throttled):
        seconds = int(exc.wait or 0)
        if seconds >= 120:
            when = f"{(seconds + 59) // 60} minutes"
        elif seconds > 0:
            when = f"{seconds} second{'s' if seconds != 1 else ''}"
        else:
            when = "a moment"
        message = f"Too many requests. Please wait {when} and try again."
        response.data = {
            "success": False,
            "message": message,
            "errors": {"detail": [message]},
            "retry_after": seconds,
        }
        return response

    if isinstance(response.data, dict) and "detail" in response.data:
        message = str(response.data["detail"])
        errors = {"detail": [message]}

    else:
        message = _first_message(response.data) or "Request failed."
        errors = response.data

    response.data = {
        "success": False,
        "message": message,
        "errors": errors,
    }

    return response