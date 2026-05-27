import logging

from django.utils import timezone
from rest_framework import generics, status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.appliances.models import UserAppliance
from apps.predictions.models import Prediction
from services.recommender_service import run_analysis, run_apply_reductions, run_auto_suggest
from services.chatbot_service import build_user_context, sync_chat

from .models import Recommendation, ReductionPlan
from .serializers import (
    ApplyReductionsSerializer,
    GenerateRecommendationSerializer,
    RecommendationSerializer,
)

logger = logging.getLogger(__name__)


class GenerateRecommendationView(APIView):
    """POST /api/v1/recommendations/generate/ — rule-based analysis."""

    def post(self, request):
        serializer = GenerateRecommendationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        user = request.user

        # Get prediction
        if "prediction_id" in data:
            prediction = generics.get_object_or_404(
                Prediction, pk=data["prediction_id"], user=user
            )
        else:
            prediction = Prediction.objects.filter(user=user).first()
            if not prediction:
                return Response(
                    {"detail": "No predictions found. Generate a prediction first."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        # Get appliances
        appliances = list(UserAppliance.objects.filter(user=user, is_active=True))
        if not appliances:
            return Response(
                {"detail": "No appliances configured. Add appliances first."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        budget = getattr(user, "budget", None)
        budget_pkr = data.get("budget_pkr") or (float(budget.max_pkr) if budget else None)
        budget_units = data.get("budget_units") or (budget.max_units if budget else None)

        analysis = run_analysis(
            appliances=appliances,
            predicted_units=prediction.predicted_units,
            predicted_bill=float(prediction.predicted_bill),
            budget_pkr=budget_pkr,
            budget_units=budget_units,
            bill_kwargs=user.bill_kwargs,
        )

        rec = Recommendation.objects.create(
            user=user,
            prediction_id=prediction.id,
            analysis=analysis,
            predicted_units=prediction.predicted_units,
            predicted_bill_pkr=prediction.predicted_bill,
            budget_pkr=budget_pkr,
            units_gap=analysis.get("units_gap", 0),
            pkr_gap=analysis.get("pkr_gap", 0),
            within_budget=analysis.get("within_pkr_budget", True),
        )

        return Response(RecommendationSerializer(rec).data, status=status.HTTP_201_CREATED)


class SmartRecommendationView(APIView):
    """
    POST /api/v1/recommendations/smart/

    Returns BOTH rule-based (recommender module) and GROQ AI recommendations
    in one call, contextualised by budget situation:

      - well_within  (<50% budget used): encouragement + tips to stay on track
      - midway       (50–74%): moderate alert + top savings opportunities
      - approaching  (75–99%): urgent — specific appliance cuts with PKR savings
      - exceeded     (≥100%): critical — auto-suggest + GROQ action plan

    Also auto-runs the optimizer to show what the bill would look like
    if all suggested reductions were applied.
    """

    def post(self, request):
        user = request.user
        data = request.data

        # ── Resolve prediction ─────────────────────────────────────────────────
        pred_id = data.get("prediction_id")
        prediction = (
            Prediction.objects.get(pk=pred_id, user=user)
            if pred_id
            else Prediction.objects.filter(user=user).first()
        )
        if not prediction:
            return Response(
                {"detail": "No prediction found. Trigger a LESCO fetch or generate a prediction first."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # ── Resolve budget ─────────────────────────────────────────────────────
        budget = getattr(user, "budget", None)
        budget_pkr   = float(data.get("budget_pkr")   or (budget.max_pkr    if budget else 0) or 0)
        budget_units = int(  data.get("budget_units") or (budget.max_units   if budget else 0) or 0)
        predicted_bill  = float(prediction.predicted_bill)
        predicted_units = prediction.predicted_units

        # ── IoT actual consumption (LAG-delta — handles session resets correctly) ─
        # get_iot_consumption() uses Max−Min which under-counts when the device
        # resets its cumulative counter mid-cycle.  _get_iot_context() sums positive
        # per-reading deltas, identical to the prediction engine.
        from apps.predictions.views import _get_iot_context
        iot_ctx       = _get_iot_context(user)
        iot_has_data  = iot_ctx["has_iot"]
        iot_consumed_pkr = iot_ctx["current_bill_pkr"] if iot_has_data else 0.0
        iot_consumed_kwh = iot_ctx["measured_kwh"]     if iot_has_data else 0.0

        # ── Billing-cycle context (remaining days) ────────────────────────────
        remaining_days = max(1, iot_ctx["total_cycle_days"] - iot_ctx["days_elapsed"]) \
                         if iot_has_data else 30

        # ── RIGHT MENTAL MODEL ────────────────────────────────────────────────
        # Progress bar / situation = IoT actual (what has been spent, a fact)
        # Projection warning        = prediction (shown as a secondary badge)
        if iot_has_data and budget_pkr > 0:
            pct_used = round(iot_consumed_pkr / budget_pkr * 100, 1)
        elif budget_pkr > 0:
            pct_used = round(predicted_bill / budget_pkr * 100, 1)
        else:
            pct_used = 0.0

        # Projection warning fields (separate from situation)
        proj_pct = round(predicted_bill / budget_pkr * 100, 1) if budget_pkr > 0 else 0
        projection_exceeds_budget = budget_pkr > 0 and predicted_bill > budget_pkr
        proj_over_by = round(max(0.0, predicted_bill - budget_pkr), 2)

        # Situation based on actual consumption
        if pct_used >= 100:
            situation = "exceeded"
        elif pct_used >= 75:
            situation = "approaching"
        elif pct_used >= 50:
            situation = "midway"
        else:
            situation = "well_within"

        # Budget still available for the rest of the cycle
        remaining_budget_pkr = max(0.0, budget_pkr - iot_consumed_pkr) if budget_pkr > 0 else budget_pkr

        # ── Rule-based analysis (remaining-days context) ──────────────────────
        appliances = list(UserAppliance.objects.filter(user=user, is_active=True))
        rule_analysis  = {}
        auto_suggestions = []
        optimized_bill = None  # None = no optimization run

        if appliances:
            try:
                from services.predictor_service import calculate_tariff_bill

                # Scale appliance wattage for remaining days so the recommender's
                # internal 30-day math gives correct remaining-period figures.
                scale = remaining_days / 30.0
                scaled_apps = []
                for a in appliances:
                    scaled_apps.append({
                        "name":          a.name,
                        "wattage_w":     a.wattage_w * scale,
                        "hours_per_day": a.hours_per_day,
                        "quantity":      a.quantity,
                        "category":      a.category,
                        "monthly_units": round(
                            a.wattage_w / 1000 * a.hours_per_day * a.quantity * remaining_days, 2
                        ),
                    })

                appliance_units_remaining = sum(s["monthly_units"] for s in scaled_apps)
                total_projected_units = int(iot_consumed_kwh + appliance_units_remaining)
                total_projected_bill  = calculate_tariff_bill(
                    total_projected_units, **user.bill_kwargs
                )["total_payable"]

                rule_analysis = run_analysis(
                    appliances=scaled_apps,
                    predicted_units=total_projected_units,
                    predicted_bill=total_projected_bill,
                    budget_pkr=budget_pkr or None,
                    budget_units=budget_units or None,
                    bill_kwargs=user.bill_kwargs,
                )

                if situation in ("approaching", "exceeded"):
                    auto_suggestions = run_auto_suggest(
                        appliances=scaled_apps,
                        predicted_units=total_projected_units,
                        bill_kwargs=user.bill_kwargs,
                        budget_pkr=budget_pkr or None,
                        budget_units=budget_units or None,
                    )
                    if auto_suggestions:
                        optimized_bill = auto_suggestions[-1]["new_bill"]

            except Exception as e:
                logger.warning(f"Rule-based analysis error: {e}")

        # ── GROQ AI recommendation ────────────────────────────────────────────
        groq_advice = ""
        try:
            from apps.bills.models import BillRecord

            bills = BillRecord.objects.filter(user=user).order_by("year", "mon_idx")
            history_data = {
                "history_units": [b.units for b in bills],
                "raw_rows": [
                    {"month": b.month_label, "units": b.units, "bill": int(b.bill_amount)}
                    for b in bills
                ],
            } if bills.exists() else None

            appliance_dicts = [
                {"name": a.name, "wattage_w": a.wattage_w,
                 "hours_per_day": a.hours_per_day, "quantity": a.quantity, "category": a.category}
                for a in appliances
            ]

            context = build_user_context(
                ref_no=user.ref_no,
                bill_kwargs=user.bill_kwargs,
                history_data=history_data,
                prediction=prediction.result,
                appliances=appliance_dicts,
                budget_pkr=budget_pkr or None,
                budget_units=budget_units or None,
            )

            # Build an honest situation string for the AI
            spent_str = (
                f"I've spent Rs {iot_consumed_pkr:,.0f} ({iot_consumed_kwh:.2f} kWh, {pct_used:.1f}% of my Rs {budget_pkr:,.0f} budget) this billing cycle so far."
                if iot_has_data else
                f"My predicted bill is Rs {predicted_bill:,.0f} ({pct_used:.1f}% of my Rs {budget_pkr:,.0f} budget)."
            )
            proj_str = (
                f" The system projects Rs {predicted_bill:,.0f} at month-end (based on current device rate) — "
                f"Rs {proj_over_by:,.0f} over budget."
                if projection_exceeds_budget else
                f" Month-end projection: Rs {predicted_bill:,.0f} ({proj_pct:.0f}% of budget)."
            )
            remaining_str = (
                f" Rs {remaining_budget_pkr:,.0f} of budget remains for the next {remaining_days} day(s)."
                if budget_pkr > 0 else ""
            )

            situation_prompts = {
                "well_within": (
                    f"{spent_str}{proj_str}{remaining_str} "
                    f"What 2 habits should I keep to stay on track and save more?"
                ),
                "midway": (
                    f"{spent_str}{proj_str}{remaining_str} "
                    f"Which 2 appliances need closest monitoring for the remaining {remaining_days} days?"
                ),
                "approaching": (
                    f"{spent_str}{proj_str}{remaining_str} "
                    f"Give me 3 specific appliance cuts with exact unit and rupee savings for the remaining {remaining_days} days."
                ),
                "exceeded": (
                    f"{spent_str}{proj_str}{remaining_str} "
                    f"Give me an urgent 3-step action plan for the remaining {remaining_days} days. "
                    f"Be specific: which appliance, how many hours to cut, exact kWh and rupee savings."
                ),
            }

            groq_advice = sync_chat(
                messages=[{"role": "user", "content": situation_prompts[situation]}],
                context=context,
            )
        except Exception as e:
            logger.warning(f"GROQ smart recommendation failed: {e}")
            groq_advice = ""

        # ── Build response ─────────────────────────────────────────────────────
        return Response(
            {
                "situation": situation,
                "remaining_days": remaining_days,
                "budget_status": {
                    # ── IoT actual (drives progress bar) ──────────────────────
                    "pct_used":      pct_used,          # IoT actual %
                    "budget_pkr":    budget_pkr,
                    "iot_cost_pkr":  round(iot_consumed_pkr, 2),
                    "iot_units_kwh": round(iot_consumed_kwh, 2),
                    "iot_pct":       pct_used,           # same as pct_used
                    "has_iot":       iot_has_data,
                    "remaining_budget_pkr": round(remaining_budget_pkr, 2),
                    # ── Projection warning (secondary) ─────────────────────
                    "predicted_bill_pkr":         round(predicted_bill, 2),
                    "proj_pct":                   proj_pct,
                    "projection_exceeds_budget":  projection_exceeds_budget,
                    "over_budget_by_pkr":         proj_over_by,
                },
                "rule_based": {
                    "appliance_breakdown": rule_analysis.get("appliance_breakdown", []),
                    "units_to_save":       rule_analysis.get("units_to_save_for_pkr", 0),
                    "pkr_gap":             rule_analysis.get("pkr_gap", 0),
                },
                "auto_optimization": {
                    "steps":             auto_suggestions,
                    "optimized_bill_pkr": optimized_bill,
                    "optimized_units":   auto_suggestions[-1]["new_total_units"] if auto_suggestions else None,
                    "total_saved_pkr":   round((predicted_bill - optimized_bill), 2) if optimized_bill is not None else 0,
                },
                "groq_advice": groq_advice,
            }
        )


class RecommendationListView(generics.ListAPIView):
    serializer_class = RecommendationSerializer

    def get_queryset(self):
        return Recommendation.objects.filter(user=self.request.user)


class RecommendationDetailView(generics.RetrieveAPIView):
    serializer_class = RecommendationSerializer

    def get_queryset(self):
        return Recommendation.objects.filter(user=self.request.user)


class ApplyReductionsView(APIView):
    """
    POST /api/v1/recommendations/<pk>/apply/
    User chose specific reductions → compute exact savings + update DB.
    """

    def post(self, request, pk):
        rec = generics.get_object_or_404(Recommendation, pk=pk, user=request.user)
        serializer = ApplyReductionsSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        appliances = list(UserAppliance.objects.filter(user=request.user, is_active=True))
        result = run_apply_reductions(
            appliances=appliances,
            reductions=serializer.validated_data["reductions"],
            predicted_units=rec.predicted_units,
            bill_kwargs=request.user.bill_kwargs,
            budget_pkr=float(rec.budget_pkr) if rec.budget_pkr else None,
        )

        # Persist reduction steps
        rec.reductions.all().delete()
        for step in result.get("steps", []):
            ReductionPlan.objects.create(
                recommendation=rec,
                appliance_name=step["appliance"],
                hours_reduced=step["hours_reduced"],
                units_saved=step["units_saved"],
                # Module returns "money_saved_step"; fall back to "pkr_saved" for safety
                pkr_saved=step.get("money_saved_step", step.get("pkr_saved", 0)),
                new_total_units=step["new_total_units"],
                new_bill_pkr=step["new_bill"],
                slab_crossed=step.get("slab_crossed", False),
            )

        rec.applied = True
        rec.applied_at = timezone.now()
        rec.save(update_fields=["applied", "applied_at"])

        return Response({**RecommendationSerializer(rec).data, "apply_result": result})
