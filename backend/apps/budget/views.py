from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.predictions.models import Prediction

from .models import Budget, BudgetAlert
from .serializers import BudgetAlertSerializer, BudgetSerializer


def _build_budget_status(budget, user):
    """
    Return enriched budget dict.

    Consumption source priority
    ───────────────────────────
    1. IoT measured kWh this billing cycle (via _get_iot_context — same function
       used by Dashboard and Predictions so all views are consistent).
    2. Latest prediction (fallback when no IoT device is active).

    The projection warning (projected_bill_pkr / projection_exceeds_budget) is
    always derived from the latest Prediction and shown as a separate badge so
    users understand end-of-month risk without conflating it with actual spend.
    """
    from apps.predictions.models import Prediction
    from apps.predictions.views import _get_iot_context

    data = BudgetSerializer(budget).data
    prediction = Prediction.objects.filter(user=user).first()

    # Use the canonical IoT context (same as Dashboard / Predictions views).
    iot = _get_iot_context(user)

    # ── Progress bar: actual consumption (fact, not projection) ──────────────
    if iot["has_iot"] and iot["measured_kwh"] > 0:
        consumed_pkr = iot["current_bill_pkr"]
        source = "iot"
    elif prediction:
        consumed_pkr = float(prediction.predicted_bill)
        source = "prediction"
    else:
        return data

    pct = consumed_pkr / float(budget.max_pkr) * 100 if budget.max_pkr else 0
    data["current_bill_pkr"]    = round(consumed_pkr, 2)
    data["budget_used_pct"]     = round(pct, 1)
    data["consumption_source"]  = source

    if iot["has_iot"]:
        data["iot_units_kwh"]    = iot["measured_kwh"]
        data["iot_cost_pkr"]     = iot["current_bill_pkr"]
        data["iot_daily_kwh"]    = iot["iot_daily_rate_kwh"]
        # Expose tariff context so the frontend can show effective rate
        data["is_protected"]     = user.is_protected_consumer
        data["tariff_rate_pkr"]  = (
            round(consumed_pkr / iot["measured_kwh"], 2)
            if iot["measured_kwh"] > 0 else None
        )

    # ── Projection warning ────────────────────────────────────────────────────
    if prediction:
        pred_pkr = float(prediction.predicted_bill)
        data["projected_bill_pkr"]        = round(pred_pkr, 2)
        data["projection_exceeds_budget"] = pred_pkr > float(budget.max_pkr)
        data["projected_over_by_pkr"]     = round(max(0.0, pred_pkr - float(budget.max_pkr)), 2)

    return data


class BudgetView(APIView):
    """GET → retrieve; POST → create/update (upsert)."""

    def get(self, request):
        try:
            budget = request.user.budget
        except Budget.DoesNotExist:
            return Response({"detail": "No budget configured."}, status=status.HTTP_404_NOT_FOUND)
        return Response(_build_budget_status(budget, request.user))

    def post(self, request):
        serializer = BudgetSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        budget, _ = Budget.objects.update_or_create(
            user=request.user, defaults=serializer.validated_data
        )

        # Fire smart recommendation if a prediction exists
        prediction = Prediction.objects.filter(user=request.user).first()
        if prediction:
            from tasks.prediction_tasks import smart_recommendation_for_user
            smart_recommendation_for_user.delay(
                user_id=request.user.id,
                prediction_id=prediction.id,
            )

        return Response(_build_budget_status(budget, request.user), status=status.HTTP_200_OK)


class BudgetUpdateView(APIView):
    def put(self, request):
        budget = getattr(request.user, "budget", None)
        if not budget:
            return Response({"detail": "No budget found."}, status=status.HTTP_404_NOT_FOUND)
        serializer = BudgetSerializer(budget, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(_build_budget_status(budget, request.user))


class BudgetAlertsView(APIView):
    def get(self, request):
        budget = getattr(request.user, "budget", None)
        if not budget:
            return Response([])
        alerts = BudgetAlert.objects.filter(budget=budget)
        return Response(BudgetAlertSerializer(alerts, many=True).data)


class BudgetHistoryView(APIView):
    """GET historical budget usage based on actual bills."""

    def get(self, request):
        from apps.bills.models import BillRecord
        bills = BillRecord.objects.filter(user=request.user).order_by("year", "mon_idx")
        budget = getattr(request.user, "budget", None)
        history = []
        for bill in bills:
            row = {
                "month": bill.month_label,
                "units": bill.units,
                "bill_pkr": float(bill.bill_amount),
            }
            if budget:
                row["budget_pkr"] = float(budget.max_pkr)
                row["over_budget"] = float(bill.bill_amount) > float(budget.max_pkr)
            history.append(row)
        return Response(history)
