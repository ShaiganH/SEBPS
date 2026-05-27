from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import AuthenticationFailed

from .models import IoTDevice


class DeviceTokenAuthentication(BaseAuthentication):
    """
    ESP32 devices authenticate with a pre-shared bearer token sent in
    the X-Device-Token header.  request.user is set to the device owner,
    request.auth is set to the IoTDevice instance.
    """

    keyword = "X-Device-Token"

    def authenticate(self, request):
        token = request.headers.get("X-Device-Token") or request.META.get(
            "HTTP_X_DEVICE_TOKEN"
        )
        if not token:
            return None
        try:
            device = IoTDevice.objects.select_related("user").get(token=token, is_active=True)
        except IoTDevice.DoesNotExist:
            raise AuthenticationFailed("Invalid or inactive device token.")
        return (device.user, device)
