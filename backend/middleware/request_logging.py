import logging
import time

logger = logging.getLogger("middleware")


class RequestLoggingMiddleware:
    """
    Log every HTTP request with method, path, status, duration, user-id, and
    response size.  4xx/5xx responses are logged at WARNING so they surface in
    the error log file without needing to scan the full access log.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        start = time.monotonic()
        response = self.get_response(request)
        duration_ms = (time.monotonic() - start) * 1000

        user = getattr(request, "user", None)
        uid  = user.id if (user and user.is_authenticated) else "-"
        size = len(getattr(response, "content", b""))

        msg = (
            f"{request.method} {request.path} → {response.status_code} "
            f"({duration_ms:.1f}ms) user={uid} size={size}B"
        )

        if response.status_code >= 500:
            logger.error(msg)
        elif response.status_code >= 400:
            logger.warning(msg)
        else:
            logger.info(msg)

        return response
