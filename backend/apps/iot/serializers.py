from rest_framework import serializers

from .models import IoTDevice, IoTReading


class IoTDeviceSerializer(serializers.ModelSerializer):
    class Meta:
        model = IoTDevice
        fields = [
            "id", "device_id", "name", "firmware_version",
            "is_active", "last_seen", "created_at",
        ]
        read_only_fields = ["id", "last_seen", "created_at"]


class IoTDeviceCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = IoTDevice
        fields = ["device_id", "name", "firmware_version"]

    def create(self, validated_data):
        validated_data["user"] = self.context["request"].user
        return super().create(validated_data)


class IoTReadingSerializer(serializers.ModelSerializer):
    device_id = serializers.CharField(source="device.device_id", read_only=True)

    class Meta:
        model = IoTReading
        fields = [
            "id", "device_id", "time",
            "voltage", "current", "power", "energy",
            "frequency", "power_factor",
        ]
        read_only_fields = ["id"]


class IoTReadingIngestSerializer(serializers.Serializer):
    """Used by the ESP32 to POST readings — authenticated via device token."""
    time = serializers.DateTimeField(required=False)
    voltage = serializers.FloatField()
    current = serializers.FloatField()
    power = serializers.FloatField()
    energy = serializers.FloatField()
    frequency = serializers.FloatField(default=50.0)
    power_factor = serializers.FloatField(default=1.0)


class IoTStatsSerializer(serializers.Serializer):
    device_id = serializers.CharField()
    period = serializers.CharField()
    total_energy_kwh = serializers.FloatField()
    avg_power_w = serializers.FloatField()
    max_power_w = serializers.FloatField()
    avg_voltage = serializers.FloatField()
    reading_count = serializers.IntegerField()
    estimated_cost_pkr = serializers.FloatField()
