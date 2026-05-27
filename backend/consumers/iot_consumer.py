import json
import logging

from channels.generic.websocket import AsyncWebsocketConsumer

logger = logging.getLogger(__name__)


class IoTConsumer(AsyncWebsocketConsumer):
    """
    WebSocket endpoint: ws/iot/<device_id>/
    Frontend connects here to receive live IoT readings as they arrive from the ESP32.
    The ESP32 POSTs to /api/v1/iot/readings/ → Django broadcasts to this group.
    """

    async def connect(self):
        user = self.scope.get("user")
        if not user or not user.is_authenticated:
            await self.close(code=4001)
            return

        self.device_id = self.scope["url_route"]["kwargs"]["device_id"]
        self.group_name = f"iot_{self.device_id}"

        # Verify ownership
        from channels.db import database_sync_to_async
        from apps.iot.models import IoTDevice

        try:
            await database_sync_to_async(
                lambda: IoTDevice.objects.get(device_id=self.device_id, user=user)
            )()
        except IoTDevice.DoesNotExist:
            logger.warning(
                f"User {user.id} tried to subscribe to device {self.device_id} they don't own"
            )
            await self.close(code=4003)
            return

        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()
        logger.info(f"WS: user {user.id} subscribed to {self.group_name}")

    async def disconnect(self, close_code):
        if hasattr(self, "group_name"):
            await self.channel_layer.group_discard(self.group_name, self.channel_name)

    async def receive(self, text_data):
        # Client can send ping to keep connection alive
        try:
            data = json.loads(text_data)
            if data.get("type") == "ping":
                await self.send(json.dumps({"type": "pong"}))
        except json.JSONDecodeError:
            pass

    async def iot_reading(self, event):
        """Called by channel layer when IngestReadingView broadcasts a new reading."""
        await self.send(
            json.dumps({"type": "reading", "data": event["data"]})
        )
