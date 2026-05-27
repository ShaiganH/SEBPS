"""
GET /api/v1/auth/dashboard/ — single endpoint the home dashboard polls.
Returns profile, latest prediction, IoT-aware budget status, recent bills,
latest IoT reading, and unread notification count.
"""
from rest_framework.response import Response
from rest_framework.views import APIView


class DashboardView(APIView):
    def get(self, request):
        user = request.user

        # ── Profile ────────────────────────────────────────────────────────────
        from .serializers import UserProfileSerializer
        profile = UserProfileSerializer(user).data

        # ── Latest prediction ──────────────────────────────────────────────────
        from apps.predictions.models import Prediction
        from apps.predictions.serializers import PredictionSerializer
        pred = Prediction.objects.filter(user=user).first()
        prediction = PredictionSerializer(pred).data if pred else None

        # ── IoT billing-cycle context ──────────────────────────────────────────
        from apps.predictions.views import _get_iot_context
        iot_ctx = _get_iot_context(user)
        iot_cycle = {
            "has_iot":          iot_ctx["has_iot"],
            "measured_kwh":     iot_ctx["measured_kwh"],
            "current_bill_pkr": iot_ctx["current_bill_pkr"],
            "daily_rate_kwh":   iot_ctx["iot_daily_rate_kwh"],
            "runtime_hours":    iot_ctx["iot_runtime_hours"],
            "projected_kwh":    iot_ctx["units_so_far"],
            "days_elapsed":     iot_ctx["days_elapsed"],
            "total_cycle_days": iot_ctx["total_cycle_days"],
            "last_reading_at":  iot_ctx["last_reading_at"].isoformat() if iot_ctx["last_reading_at"] else None,
        } if iot_ctx["has_iot"] else None

        # ── IoT-aware budget status ────────────────────────────────────────────
        # Budget % always uses the prediction (end-of-month projection).
        budget_data = None
        budget = getattr(user, "budget", None)
        if budget:
            budget_data = {
                "max_pkr": float(budget.max_pkr),
                "max_units": budget.max_units,
                "is_active": budget.is_active,
            }

            # Progress bar uses actual consumption (IoT fact, not projection)
            if iot_ctx["has_iot"]:
                consumed_pkr = iot_ctx["current_bill_pkr"]
                source = "iot"
            elif pred:
                consumed_pkr = float(pred.predicted_bill)
                source = "prediction"
            else:
                consumed_pkr = 0.0
                source = None

            if consumed_pkr:
                budget_data["current_bill_pkr"]   = round(consumed_pkr, 2)
                budget_data["budget_used_pct"]    = round(
                    consumed_pkr / float(budget.max_pkr) * 100, 1
                )
                budget_data["consumption_source"] = source

            if iot_ctx["has_iot"]:
                budget_data["iot_units_kwh"] = iot_ctx["measured_kwh"]
                budget_data["iot_cost_pkr"]  = iot_ctx["current_bill_pkr"]

            # Projection warning — separate from the progress bar
            if pred:
                pred_pkr = float(pred.predicted_bill)
                budget_data["projected_bill_pkr"]        = round(pred_pkr, 2)
                budget_data["projection_exceeds_budget"] = pred_pkr > float(budget.max_pkr)
                budget_data["projected_over_by_pkr"]     = round(
                    max(0.0, pred_pkr - float(budget.max_pkr)), 2
                )

        # ── Recent bills (last 6) ──────────────────────────────────────────────
        from apps.bills.models import BillRecord
        from apps.bills.serializers import BillRecordSerializer
        recent_bills = BillRecord.objects.filter(user=user)[:6]
        bills = BillRecordSerializer(recent_bills, many=True).data

        # ── Latest IoT reading & device count ─────────────────────────────────
        from apps.iot.models import IoTDevice, IoTReading
        from apps.iot.serializers import IoTReadingSerializer
        iot_reading = None
        active_devices = IoTDevice.objects.filter(user=user, is_active=True).count()
        device = IoTDevice.objects.filter(user=user, is_active=True).first()
        if device:
            reading = IoTReading.objects.filter(device=device).order_by("-time").first()
            if reading:
                iot_reading = IoTReadingSerializer(reading).data

        # ── Unread notifications ───────────────────────────────────────────────
        from apps.notifications.models import Notification
        unread_count = Notification.objects.filter(user=user, is_read=False).count()

        return Response({
            "profile": profile,
            "prediction": prediction,
            "budget": budget_data,
            "recent_bills": bills,
            "iot": {
                "active_devices": active_devices,
                "latest_reading": iot_reading,
            },
            "iot_cycle": iot_cycle,
            "unread_notifications": unread_count,
        })
