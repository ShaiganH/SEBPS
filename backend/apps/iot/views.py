import logging
from datetime import timedelta

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.core.cache import cache
from django.db.models import Avg, Count, Max, Min
from django.utils import timezone
from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from .authentication import DeviceTokenAuthentication
from .models import IoTDevice, IoTReading, IoTSimulator
from .serializers import (
    IoTDeviceCreateSerializer,
    IoTDeviceSerializer,
    IoTReadingIngestSerializer,
    IoTReadingSerializer,
    IoTStatsSerializer,
)

logger = logging.getLogger(__name__)


# ── Device CRUD ───────────────────────────────────────────────────────────────

class DeviceListCreateView(generics.ListCreateAPIView):
    def get_serializer_class(self):
        return IoTDeviceCreateSerializer if self.request.method == "POST" else IoTDeviceSerializer

    def get_queryset(self):
        return IoTDevice.objects.filter(user=self.request.user)


class DeviceDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = IoTDeviceSerializer

    def get_queryset(self):
        return IoTDevice.objects.filter(user=self.request.user)


class DeviceTokenView(APIView):
    """GET → retrieve token; POST → rotate token."""

    def get(self, request, pk):
        device = generics.get_object_or_404(IoTDevice, pk=pk, user=request.user)
        return Response({"token": device.token, "device_id": device.device_id})

    def post(self, request, pk):
        device = generics.get_object_or_404(IoTDevice, pk=pk, user=request.user)
        new_token = device.rotate_token()
        return Response({"token": new_token, "device_id": device.device_id})


# ── Reading ingestion (Device-Token auth — ESP32 / simulator) ─────────────────

class IngestReadingView(APIView):
    """
    POST /api/v1/iot/readings/
    Authenticated via X-Device-Token header (no JWT needed — for embedded devices).
    """
    authentication_classes = [DeviceTokenAuthentication]
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        serializer = IoTReadingIngestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        device = request.auth  # IoTDevice instance set by DeviceTokenAuthentication
        now = timezone.now()

        reading = IoTReading.objects.create(
            device=device,
            time=data.get("time", now),
            voltage=data["voltage"],
            current=data["current"],
            power=data["power"],
            energy=data["energy"],
            frequency=data.get("frequency", 50.0),
            power_factor=data.get("power_factor", 1.0),
        )

        device.last_seen = now
        device.save(update_fields=["last_seen"])

        # ── WebSocket broadcast ───────────────────────────────────────────────
        channel_layer = get_channel_layer()
        try:
            async_to_sync(channel_layer.group_send)(
                f"iot_{device.device_id}",
                {"type": "iot.reading", "data": IoTReadingSerializer(reading).data},
            )
        except Exception as e:
            logger.debug(f"WS broadcast error: {e}")

        # ── Budget threshold check (rate-limited to once per 5 min per user) ─
        cache_key = f"iot_budget_chk_{device.user_id}"
        if not cache.get(cache_key):
            cache.set(cache_key, 1, timeout=300)  # 5-minute window
            try:
                from services.iot_service import get_iot_consumption
                from tasks.notification_tasks import check_budget_thresholds
                iot = get_iot_consumption(device.user, days=30)
                if iot["has_data"]:
                    check_budget_thresholds.delay(
                        device.user_id,
                        int(iot["units_kwh"]),
                        iot["cost_pkr"],
                    )
            except Exception as e:
                logger.debug(f"Budget check dispatch error: {e}")

        return Response({"id": reading.id, "time": reading.time}, status=status.HTTP_201_CREATED)


# ── Reading retrieval ─────────────────────────────────────────────────────────

class ReadingListView(generics.ListAPIView):
    serializer_class = IoTReadingSerializer

    def get_queryset(self):
        device = generics.get_object_or_404(
            IoTDevice, device_id=self.kwargs["device_id"], user=self.request.user
        )
        qs = IoTReading.objects.filter(device=device).order_by("-time")
        hours = self.request.query_params.get("hours")
        if hours:
            qs = qs.filter(time__gte=timezone.now() - timedelta(hours=int(hours)))
        return qs


class LatestReadingView(APIView):
    def get(self, request, device_id):
        device = generics.get_object_or_404(IoTDevice, device_id=device_id, user=request.user)
        reading = IoTReading.objects.filter(device=device).order_by("-time").first()
        if not reading:
            return Response({"detail": "No readings yet."}, status=status.HTTP_404_NOT_FOUND)
        return Response(IoTReadingSerializer(reading).data)


# ── Statistics ────────────────────────────────────────────────────────────────

class DeviceStatsView(APIView):
    """GET /api/v1/iot/stats/<device_id>/?period=24h|7d|30d"""

    def get(self, request, device_id):
        device = generics.get_object_or_404(IoTDevice, device_id=device_id, user=request.user)
        period = request.query_params.get("period", "24h")
        hours = {"24h": 24, "7d": 168, "30d": 720}.get(period, 24)
        since = timezone.now() - timedelta(hours=hours)

        agg = IoTReading.objects.filter(device=device, time__gte=since).aggregate(
            # Energy: cumulative counter — use Max−Min to get delta for the window
            max_energy=Max("energy"),
            min_energy=Min("energy"),
            avg_power=Avg("power"),
            max_power=Max("power"),
            avg_voltage=Avg("voltage"),
            count=Count("id"),
        )

        # Correct delta energy for the window
        energy_kwh = max(0.0, (agg["max_energy"] or 0.0) - (agg["min_energy"] or 0.0))

        # Cost via tariff module
        try:
            from tariff import calculate_bill
            bill = calculate_bill(units=round(energy_kwh), **request.user.bill_kwargs)
            estimated_cost = float(bill.get("total_payable", 0))
        except Exception:
            estimated_cost = energy_kwh * 33.10  # mid-range fallback

        return Response({
            "device_id": device_id,
            "period": period,
            "total_energy_kwh": round(energy_kwh, 4),
            "avg_power_w": round(agg["avg_power"] or 0, 2),
            "max_power_w": round(agg["max_power"] or 0, 2),
            "avg_voltage": round(agg["avg_voltage"] or 0, 1),
            "reading_count": agg["count"],
            "estimated_cost_pkr": round(estimated_cost, 2),
        })


# ── Simulator control ─────────────────────────────────────────────────────────

class SimulatorView(APIView):
    """
    POST /api/v1/iot/devices/<pk>/simulate/

    Body:
        { "action": "start",   "wattage_w": 1500, "interval_seconds": 5 }
        { "action": "stop" }
        { "action": "setload", "wattage_w": 2000 }

    The Celery task runs in the background and posts readings until stopped.
    """

    def get(self, request, pk):
        """Return current simulator state."""
        device = generics.get_object_or_404(IoTDevice, pk=pk, user=request.user)
        try:
            sim = device.simulator
            return Response({
                "is_running": sim.is_running,
                "wattage_w": sim.wattage_w,
                "interval_seconds": sim.interval_seconds,
                "started_at": sim.started_at,
            })
        except IoTSimulator.DoesNotExist:
            return Response({"is_running": False, "wattage_w": 1500, "interval_seconds": 5})

    def post(self, request, pk):
        device = generics.get_object_or_404(IoTDevice, pk=pk, user=request.user)
        action = request.data.get("action", "start")
        wattage = float(request.data.get("wattage_w", 1500))
        interval = int(request.data.get("interval_seconds", 5))

        # Clamp values — high wattage intentionally allowed for fast-data testing
        wattage = max(50.0, min(wattage, 100_000.0))   # up to 100 kW
        interval = max(1, min(interval, 60))            # down to 1 s

        if action == "start":
            started_at = timezone.now()
            sim, _ = IoTSimulator.objects.update_or_create(
                device=device,
                defaults={
                    "is_running": True,
                    "wattage_w": wattage,
                    "interval_seconds": interval,
                    "started_at": started_at,
                },
            )
            from tasks.iot_tasks import run_iot_simulator
            # started_at_ts acts as session token — stale chains detect mismatch and stop
            task = run_iot_simulator.apply_async(
                kwargs={
                    "device_pk":     device.pk,
                    "started_at_ts": started_at.isoformat(),
                    "session_energy": 0.0,
                    "reading_count":  0,
                },
            )
            sim.celery_task_id = task.id
            sim.save(update_fields=["celery_task_id"])
            logger.info(f"[Sim] Started for device '{device.device_id}' @ {wattage}W, task {task.id}")
            return Response({
                "status": "started",
                "device_id": device.device_id,
                "wattage_w": wattage,
                "interval_seconds": interval,
                "task_id": task.id,
            })

        elif action == "stop":
            try:
                sim = device.simulator
                sim.is_running = False
                sim.save(update_fields=["is_running"])
            except IoTSimulator.DoesNotExist:
                pass
            return Response({"status": "stopped", "device_id": device.device_id})

        elif action == "setload":
            sim, _ = IoTSimulator.objects.get_or_create(
                device=device,
                defaults={"wattage_w": wattage, "interval_seconds": interval},
            )
            sim.wattage_w = wattage
            sim.save(update_fields=["wattage_w"])
            return Response({
                "status": "load_updated",
                "device_id": device.device_id,
                "wattage_w": wattage,
            })

        return Response({"detail": "Invalid action. Use start|stop|setload."}, status=400)
