import logging

from rest_framework.response import Response
from rest_framework.views import exception_handler

logger = logging.getLogger("apps")


def custom_exception_handler(exc, context):
    response = exception_handler(exc, context)
    if response is not None:
        errors = response.data
        if isinstance(errors, dict) and "detail" not in errors:
            # Flatten field errors into a human-readable list
            flat = []
            for field, msgs in errors.items():
                if isinstance(msgs, list):
                    flat.append(f"{field}: {'; '.join(str(m) for m in msgs)}")
                else:
                    flat.append(f"{field}: {msgs}")
            response.data = {"detail": " | ".join(flat), "errors": errors}
    else:
        logger.exception("Unhandled exception in view", exc_info=exc)
        response = Response(
            {"detail": "An unexpected error occurred. Please try again later."},
            status=500,
        )
    return response
