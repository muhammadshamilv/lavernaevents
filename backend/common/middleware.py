from django.http import JsonResponse


class RejectNullBytesMiddleware:
    """Answer 400 to any URL that carries a NUL byte.

    A NUL can never be valid input here, and PostgreSQL refuses it inside a
    query parameter - which used to surface as an HTTP 500 on public pages
    such as /api/respond/<token>/.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if "\x00" in request.path_info or "%00" in request.META.get("QUERY_STRING", ""):
            return JsonResponse(
                {
                    "success": False,
                    "message": "Invalid request.",
                    "errors": {"detail": ["The address contains invalid characters."]},
                },
                status=400,
            )

        return self.get_response(request)
