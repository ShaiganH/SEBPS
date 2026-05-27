from django.contrib import admin

from .models import IoTDevice, IoTReading


@admin.register(IoTDevice)
class IoTDeviceAdmin(admin.ModelAdmin):
    list_display = ["user", "device_id", "name", "is_active", "last_seen", "created_at"]
    list_filter = ["is_active"]
    search_fields = ["user__email", "device_id", "name"]
    readonly_fields = ["token"]


@admin.register(IoTReading)
class IoTReadingAdmin(admin.ModelAdmin):
    list_display = ["device", "time", "voltage", "current", "power", "energy"]
    list_filter = ["device"]
    search_fields = ["device__device_id"]
    ordering = ["-time"]
