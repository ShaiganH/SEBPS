from rest_framework import serializers

from .models import Notification


class NotificationSerializer(serializers.ModelSerializer):
    # Expose as `notification_type` so the frontend field name is clear and
    # doesn't clash with Python builtins / JS reserved words.
    notification_type = serializers.CharField(source="type", read_only=True)

    class Meta:
        model = Notification
        fields = ["id", "notification_type", "title", "message", "is_read", "data", "created_at"]
        read_only_fields = fields
