import secrets

from django.conf import settings
from django.db import models
from timescale.db.models.models import TimescaleModel


class IoTDevice(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="devices"
    )
    device_id = models.CharField(max_length=64, unique=True)
    name = models.CharField(max_length=100, default="ESP32 Meter")
    token = models.CharField(
        max_length=64, unique=True, default=secrets.token_hex,
        help_text="Bearer token embedded in ESP32 firmware",
    )
    firmware_version = models.CharField(max_length=20, blank=True)
    is_active = models.BooleanField(default=True)
    last_seen = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "iot_devices"

    def __str__(self):
        return f"{self.name} ({self.device_id})"

    def rotate_token(self):
        self.token = secrets.token_hex()
        self.save(update_fields=["token"])
        return self.token


class IoTReading(TimescaleModel):
    """
    TimescaleDB hypertable — partitioned by `time` (maps to timestamp).
    TimescaleModel automatically creates the hypertable on first migration.
    """

    time = models.DateTimeField(db_index=True)  # TimescaleDB partition key
    device = models.ForeignKey(
        IoTDevice, on_delete=models.CASCADE, related_name="readings"
    )

    voltage = models.FloatField(help_text="V")
    current = models.FloatField(help_text="A")
    power = models.FloatField(help_text="W — real power")
    energy = models.FloatField(help_text="kWh — cumulative")
    frequency = models.FloatField(default=50.0, help_text="Hz")
    power_factor = models.FloatField(default=1.0)

    class Meta:
        db_table = "iot_readings"
        # Compound index for efficient dashboard queries
        indexes = [
            models.Index(fields=["device", "time"]),
        ]

    def __str__(self):
        return f"{self.device.device_id} @ {self.time.isoformat()} — {self.power}W"


class IoTSimulator(models.Model):
    """
    Control record for the background Celery-based device simulator.
    One record per device — created on first 'start', updated on subsequent calls.
    """
    device = models.OneToOneField(
        IoTDevice, on_delete=models.CASCADE, related_name="simulator"
    )
    is_running = models.BooleanField(default=False)
    wattage_w = models.FloatField(default=1500.0, help_text="Current simulated load (W)")
    interval_seconds = models.IntegerField(default=5, help_text="Seconds between readings")
    celery_task_id = models.CharField(max_length=64, blank=True)
    started_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "iot_simulators"

    def __str__(self):
        state = "running" if self.is_running else "stopped"
        return f"Simulator({self.device.device_id}, {self.wattage_w}W, {state})"
