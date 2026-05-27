import calendar
import logging

from django.db.models import Max, Min
from django.utils import timezone
from rest_framework import generics, status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.bills.models import BillRecord
from services.billing_utils import get_billing_cycle
from services.predictor_service import run_prediction

from .models import Prediction
from .serializers import GeneratePredictionSerializer, PredictionSerializer

logger = logging.getLogger(__name__)


def _get_iot_context(user):
    """
    Return current billing-cycle IoT context for a user.

    Returns a dict:
        has_iot            – True if an active device has readings this cycle
        units_so_far       – kWh extrapolated to days_elapsed (float)
        measured_kwh       – raw kWh delta recorded by the device (float)
        iot_runtime_hours  – hours the device has been running this cycle (float)
        iot_daily_rate_kwh – derived daily consumption rate (float, 0 if < 1h runtime)
        days_elapsed       – days elapsed since user's billing cycle start (1-indexed)
        total_cycle_days   – total days in user's billing cycle
        billing_start      – aware datetime of midnight on the cycle start day
        last_reading_at    – aware datetime of most recent IoT reading (or None)
        device_id          – device_id string (or None)

    Extrapolation logic
    -------------------
    Raw kWh accumulated over a short burst (e.g. 7 min of 100 kW) would give a
    wildly under-estimated daily rate if divided naïvely by days_elapsed.
    Instead we derive the daily rate from *actual runtime*:

        runtime_hours  = (last_reading_time - first_reading_time) in hours
        daily_rate     = (measured_kwh / runtime_hours) * 24
        units_so_far   = daily_rate * days_elapsed

    This is only applied when runtime >= 1 hour so that a freshly connected
    device (< 1h of data) just reports raw measured_kwh without extrapolation.
    """
    from apps.iot.models import IoTDevice, IoTReading

    now = timezone.now()
    cycle = get_billing_cycle(user, now=now)
    days_elapsed     = cycle["days_elapsed"]
    total_cycle_days = cycle["total_cycle_days"]
    billing_start    = cycle["billing_start"]

    ctx = {
        "has_iot": False,
        "units_so_far": 0.0,
        "measured_kwh": 0.0,
        "iot_runtime_hours": 0.0,
        "iot_daily_rate_kwh": 0.0,
        "days_elapsed": days_elapsed,
        "total_cycle_days": total_cycle_days,
        "billing_start": billing_start,
        "last_reading_at": None,
        "device_id": None,
        "current_bill_pkr": 0.0,  # always present so callers never get KeyError
    }

    device = IoTDevice.objects.filter(user=user, is_active=True).first()
    if not device:
        return ctx

    ctx["device_id"] = device.device_id

    # ── 1. Actual consumed this billing cycle (for display + current bill) ────
    # Sum positive LAG-deltas instead of a single Max−Min.
    #
    # Why: the simulator's `energy` field is a *per-session* cumulative counter.
    # After a restart it resets to 0 (or to the last reading's value once the
    # iot/views.py seed fix is active).  A simple Max−Min across the whole
    # billing cycle freezes at the old session's peak until the new session
    # exceeds it.  Instead we compute:
    #
    #   ∑ max(energy[i] − energy[i−1], 0)   for all readings ordered by time
    #
    # Negative deltas (session resets) are clamped to 0, so they contribute
    # nothing.  Positive deltas accumulate correctly across any number of
    # restarts.  Once the seed fix is live (all sessions monotonically
    # increasing) every delta is positive anyway.
    from django.db import connection

    with connection.cursor() as cursor:
        cursor.execute("""
            SELECT
                COALESCE(SUM(GREATEST(delta, 0.0)), 0.0) AS measured_kwh,
                MIN(t)   AS first_time,
                MAX(t)   AS last_time,
                COUNT(*) AS cnt
            FROM (
                SELECT time AS t,
                       energy - LAG(energy) OVER (ORDER BY time) AS delta
                FROM   iot_readings
                WHERE  device_id = %s
                  AND  time >= %s
            ) sub
        """, [device.pk, billing_start])
        row = cursor.fetchone()

    if row is None or row[3] == 0:
        return ctx  # no readings yet

    measured_kwh = float(row[0] or 0.0)
    first_time   = row[1]
    last_time    = row[2]

    ctx["has_iot"]         = True
    ctx["last_reading_at"] = last_time
    ctx["measured_kwh"]    = round(measured_kwh, 4)

    # Total runtime since billing start (used only for display in the banner)
    if first_time and last_time:
        total_runtime = max(
            (last_time - first_time).total_seconds() / 3600,
            1 / 60,
        )
        ctx["iot_runtime_hours"] = round(total_runtime, 3)

    # ── 2. Current daily rate — rolling 2-hour window ─────────────────────────
    # Using a recent window instead of the full cycle average means the rate
    # responds to power changes within ~2 hours rather than days/weeks.
    # Example: 3h at 100kW then switch to 100W → old code takes ~10 days to
    # converge; with a 2h window it corrects within 2 hours.
    from datetime import timedelta
    RATE_WINDOW_H = 2
    window_start = max(now - timedelta(hours=RATE_WINDOW_H), billing_start)

    rate_agg = IoTReading.objects.filter(
        device=device, time__gte=window_start
    ).aggregate(
        max_e=Max("energy"),
        min_e=Min("energy"),
        first_time=Min("time"),
        last_time=Max("time"),
    )

    daily_rate = 0.0
    if rate_agg["max_e"] is not None:
        window_kwh = max(0.0, (rate_agg["max_e"] or 0.0) - (rate_agg["min_e"] or 0.0))
        w_first = rate_agg["first_time"]
        w_last  = rate_agg["last_time"]

        if w_first and w_last and window_kwh > 0:
            window_runtime = max(
                (w_last - w_first).total_seconds() / 3600,
                1 / 60,
            )
            daily_rate = (window_kwh / window_runtime) * 24

    # Fall back to full-cycle rate if the window has no data yet
    if daily_rate == 0.0 and measured_kwh > 0 and ctx["iot_runtime_hours"] > 0:
        daily_rate = (measured_kwh / ctx["iot_runtime_hours"]) * 24

    ctx["iot_daily_rate_kwh"] = round(daily_rate, 4)
    ctx["units_so_far"] = round(daily_rate * days_elapsed, 4)

    # Bill for actual measured kWh consumed so far this cycle
    if ctx["has_iot"] and ctx["measured_kwh"] > 0:
        try:
            from services.iot_service import _kwh_to_pkr
            ctx["current_bill_pkr"] = round(_kwh_to_pkr(ctx["measured_kwh"], user), 2)
        except Exception:
            ctx["current_bill_pkr"] = 0.0
    else:
        ctx["current_bill_pkr"] = 0.0

    return ctx


class GeneratePredictionView(APIView):
    """
    POST /api/v1/predictions/generate/

    All body fields are optional — when omitted the view auto-populates:
        units_so_far     ← IoT energy delta since billing-cycle start (1st of month)
        days_elapsed     ← current day of month
        total_cycle_days ← days in current calendar month
    """

    def post(self, request):
        serializer = GeneratePredictionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        user = request.user

        # Load 12-month history
        bills = BillRecord.objects.filter(user=user).order_by("year", "mon_idx")[:12]
        if bills.count() < 2:
            return Response(
                {"detail": "At least 2 months of billing history required. "
                           "Upload a bill or trigger a LESCO fetch first."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        history_units = [b.units for b in bills]

        # Auto-populate cycle context from IoT / calendar when not supplied
        iot_ctx = _get_iot_context(user)
        units_so_far     = data.get("units_so_far",     iot_ctx["units_so_far"])
        days_elapsed     = data.get("days_elapsed",     iot_ctx["days_elapsed"])
        total_cycle_days = data.get("total_cycle_days", iot_ctx["total_cycle_days"])

        # Merge user profile with any manual overrides from request
        bill_kwargs = {
            "sanctioned_load_kw": data.get("sanctioned_load_kw", user.sanctioned_load_kw),
            "protected":          data.get("is_protected",       user.is_protected_consumer),
            "fpa_per_unit":       data.get("fpa_per_unit",       user.fpa_per_unit),
            "qta_per_unit":       data.get("qta_per_unit",       user.qta_per_unit),
            "phase":              data.get("phase",              user.phase),
            "is_tax_filer":       data.get("is_tax_filer",       user.is_tax_filer),
        }

        result = run_prediction(
            history_units=history_units,
            units_so_far=round(float(units_so_far), 3),
            days_elapsed=int(days_elapsed),
            total_cycle_days=int(total_cycle_days),
            **bill_kwargs,
        )

        prediction = Prediction.objects.create(
            user=user,
            units_so_far=round(float(units_so_far), 3),
            days_elapsed=int(days_elapsed),
            total_cycle_days=int(total_cycle_days),
            fpa_per_unit=bill_kwargs["fpa_per_unit"],
            qta_per_unit=bill_kwargs["qta_per_unit"],
            sanctioned_load_kw=bill_kwargs["sanctioned_load_kw"],
            is_protected=bill_kwargs["protected"],
            is_tax_filer=bill_kwargs["is_tax_filer"],
            phase=bill_kwargs["phase"],
            result=result,
            predicted_units=result["prediction"]["units"],
            predicted_bill=result["prediction"]["bill"]["total_payable"],
            primary_source=result["confidence"]["primary_source"],
        )

        return Response(PredictionSerializer(prediction).data, status=status.HTTP_201_CREATED)


class IoTStatusView(APIView):
    """
    GET /api/v1/predictions/iot-status/

    Returns current IoT context so the frontend can show live data without
    having to generate a prediction first.

    Response:
        has_iot            – bool: active device with readings this billing cycle
        device_id          – str | null
        units_so_far       – float kWh consumed since 1st of month
        days_elapsed       – int day-of-month
        total_cycle_days   – int days in current month
        billing_start      – ISO datetime
        last_reading_at    – ISO datetime | null
        last_prediction_at – ISO datetime | null  (latest Prediction for this user)
        last_prediction_id – int | null
    """

    def get(self, request):
        ctx = _get_iot_context(request.user)

        latest_pred = Prediction.objects.filter(user=request.user).order_by("-created_at").first()

        return Response({
            "has_iot":             ctx["has_iot"],
            "device_id":           ctx["device_id"],
            # Actual accumulated kWh this billing cycle (live — updates every reading)
            "measured_kwh":        ctx["measured_kwh"],
            # Current bill for that actual kWh (what you'd pay if the cycle ended now)
            "current_bill_pkr":    ctx["current_bill_pkr"],
            # Projected end-of-month kWh/bill (daily rate × remaining days)
            "units_so_far":        ctx["units_so_far"],
            "iot_runtime_hours":   ctx["iot_runtime_hours"],
            "iot_daily_rate_kwh":  ctx["iot_daily_rate_kwh"],
            "days_elapsed":        ctx["days_elapsed"],
            "total_cycle_days":    ctx["total_cycle_days"],
            "billing_start":       ctx["billing_start"].isoformat(),
            "last_reading_at":     ctx["last_reading_at"].isoformat() if ctx["last_reading_at"] else None,
            "last_prediction_at":  latest_pred.created_at.isoformat() if latest_pred else None,
            "last_prediction_id":  latest_pred.id if latest_pred else None,
        })


class PredictionListView(generics.ListAPIView):
    serializer_class = PredictionSerializer

    def get_queryset(self):
        return Prediction.objects.filter(user=self.request.user)


class PredictionDetailView(generics.RetrieveAPIView):
    serializer_class = PredictionSerializer

    def get_queryset(self):
        return Prediction.objects.filter(user=self.request.user)


class LatestPredictionView(APIView):
    """GET /api/v1/predictions/latest/ — most recent prediction for the user."""

    def get(self, request):
        prediction = Prediction.objects.filter(user=request.user).first()
        if not prediction:
            return Response(
                {"detail": "No predictions yet."}, status=status.HTTP_404_NOT_FOUND
            )
        return Response(PredictionSerializer(prediction).data)


class ModelComparisonView(APIView):
    """GET /api/v1/predictions/<pk>/compare/ — model comparison table from stored result."""

    def get(self, request, pk):
        prediction = generics.get_object_or_404(Prediction, pk=pk, user=request.user)
        return Response(prediction.result.get("model_comparison", {}))
