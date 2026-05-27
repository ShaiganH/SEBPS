from django.urls import re_path

from .iot_consumer import IoTConsumer

websocket_urlpatterns = [
    re_path(r"^ws/iot/(?P<device_id>[^/]+)/$", IoTConsumer.as_asgi()),
]
