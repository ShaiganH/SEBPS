import logging

from rest_framework import generics, status
from rest_framework.response import Response
from rest_framework.views import APIView

from services.predictor_service import calculate_tariff_bill
from services.recommender_service import run_analysis, run_auto_suggest

from .models import ApplianceCatalog, UserAppliance
from .serializers import (
    AnalyzeAppliancesSerializer,
    ApplianceCatalogSerializer,
    OptimizeApplySerializer,
    OptimizeAppliancesSerializer,
    UserApplianceSerializer,
)

logger = logging.getLogger(__name__)


# ── Catalog ────────────────────────────────────────────────────────────────────

class CatalogListView(generics.ListAPIView):
    """GET /api/v1/appliances/catalog/ — full built-in appliance catalog."""
    serializer_class = ApplianceCatalogSerializer
    queryset = ApplianceCatalog.objects.all()
    filterset_fields = ["category"]
    search_fields = ["name", "category"]


# ── CRUD ───────────────────────────────────────────────────────────────────────

class UserApplianceListCreateView(generics.ListCreateAPIView):
    serializer_class = UserApplianceSerializer

    def get_queryset(self):
        return UserAppliance.objects.filter(user=self.request.user, is_active=True)


class UserApplianceDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = UserApplianceSerializer

    def get_queryset(self):
        return UserAppliance.objects.filter(user=self.request.user)

    def perform_destroy(self, instance):
        instance.is_active = False
        instance.save(update_fields=["is_active"])


# ── Analyze ────────────────────────────────────────────────────────────────────

class AnalyzeAppliancesView(APIView):
    """
    POST /api/v1/appliances/analyze/

    Real-time budget impact calculator — NOTHING IS SAVED.

    Use-case: "I'm adding a 1500W AC for 8 hrs. How does that affect my bill and budget?"

    Returns:
      - Per-appliance monthly units and bill contribution (sorted by impact)
      - Total units and bill from the submitted appliances
      - Comparison against the user's current budget
      - Gap (how much to cut to meet budget)
      - Slab boundary alerts
    """

    def post(self, request):
        serializer = AnalyzeAppliancesSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        user = request.user

        appliances = list(data["appliances"])

        # ── Billing-cycle context ────────────────────────────────────────────────
        # When the frontend supplies already_consumed_units + remaining_days we
        # compute appliance kWh only for the remaining period, then add it to the
        # already-measured IoT consumption.  This gives a realistic month-end
        # projection that correctly handles LESCO's non-telescoping tariff slabs
        # (bill(iot_kwh + appliance_kwh) ≠ bill(iot_kwh) + bill(appliance_kwh)).
        already_consumed = float(data.get("already_consumed_units") or 0.0)
        remaining_days   = int(data.get("remaining_days") or 30)

        # Override the serializer's 30-day monthly_units with remaining_days
        for a in appliances:
            a["monthly_units"] = round(
                a["wattage_w"] / 1000 * a["hours_per_day"] * a.get("quantity", 1) * remaining_days, 2
            )

        # Optionally merge with the user's saved appliances
        if data.get("use_saved_appliances"):
            for saved in UserAppliance.objects.filter(user=user, is_active=True):
                appliances.append({
                    "name": saved.name,
                    "wattage_w": saved.wattage_w,
                    "hours_per_day": saved.hours_per_day,
                    "quantity": saved.quantity,
                    "category": saved.category,
                    "monthly_units": round(
                        saved.wattage_w / 1000 * saved.hours_per_day * saved.quantity * remaining_days, 2
                    ),
                })

        # Resolve budget
        budget_pkr = data.get("budget_pkr")
        budget_units = data.get("budget_units")
        budget = getattr(user, "budget", None)
        if not budget_pkr and budget:
            budget_pkr = float(budget.max_pkr)
        if not budget_units and budget:
            budget_units = budget.max_units

        # Appliance contribution for the remaining billing period
        appliance_units = sum(a["monthly_units"] for a in appliances)

        # Total projected = IoT already consumed + appliance usage for remaining days.
        # Single bill calc handles slab interactions correctly.
        total_units    = already_consumed + appliance_units
        bill           = calculate_tariff_bill(int(total_units), **user.bill_kwargs)
        total_bill_pkr = bill["total_payable"]

        # Budget impact
        over_budget_by = max(0.0, total_bill_pkr - (budget_pkr or 0))
        within_budget  = (budget_pkr is None) or (total_bill_pkr <= budget_pkr)
        budget_used_pct = (
            round(total_bill_pkr / budget_pkr * 100, 1) if budget_pkr else None
        )

        # Per-appliance breakdown sorted by monthly units (highest first)
        breakdown = sorted(
            [
                {
                    "name": a["name"],
                    "category": a.get("category", "Custom"),
                    "wattage_w": a["wattage_w"],
                    "hours_per_day": a["hours_per_day"],
                    "quantity": a.get("quantity", 1),
                    "monthly_units": a["monthly_units"],
                    # Share of the *appliance* portion (IoT is not attributed to any appliance)
                    "share_pct": round(a["monthly_units"] / appliance_units * 100, 1)
                    if appliance_units > 0 else 0,
                    # Proportional bill contribution estimate (for display only)
                    "bill_contribution_pkr": round(
                        a["monthly_units"] / total_units * total_bill_pkr, 2
                    ) if total_units > 0 else 0,
                    # Units saved per 1 hr/day reduction for the remaining period
                    "save_per_1hr_units": round(
                        a["wattage_w"] / 1000 * a.get("quantity", 1) * remaining_days, 2
                    ),
                }
                for a in appliances
            ],
            key=lambda x: x["monthly_units"],
            reverse=True,
        )

        # Slab boundary alert: if the user is just above a slab cutoff, flag it
        slab_alerts = _slab_boundary_alerts(int(total_units), user)

        tip_spare = (budget_pkr or 0) - total_bill_pkr
        return Response(
            {
                "summary": {
                    "already_consumed_units": round(already_consumed, 2),
                    "remaining_days": remaining_days,
                    "appliance_units_remaining": round(appliance_units, 2),
                    "total_monthly_units": round(total_units, 1),
                    "total_bill_pkr": total_bill_pkr,
                    "bill_breakdown": bill,
                    "budget_pkr": budget_pkr,
                    "budget_units": budget_units,
                    "budget_used_pct": budget_used_pct,
                    "within_budget": within_budget,
                    "over_budget_by_pkr": round(over_budget_by, 2),
                },
                "appliance_breakdown": breakdown,
                "slab_alerts": slab_alerts,
                "tip": (
                    f"You are Rs {over_budget_by:,.0f} over your budget. "
                    f"Use the Optimize button to auto-adjust appliance hours."
                    if not within_budget
                    else f"Your appliances fit within budget with Rs {tip_spare:,.0f} to spare."
                ),
            }
        )


# ── Optimize ───────────────────────────────────────────────────────────────────

class OptimizeAppliancesView(APIView):
    """
    POST /api/v1/appliances/optimize/

    Auto-adjust appliance hours to stay within budget — NOTHING IS SAVED.

    Algorithm (from module_4_recommender):
      1. Sort appliances by hourly cost impact (highest wattage × quantity first).
      2. Reduce the biggest consumer by 1 hour at a time.
      3. Recalculate bill using real LESCO tariff slabs (non-linear).
      4. Repeat until bill ≤ budget_pkr (or units ≤ budget_units).
      5. Slab-crossing steps are flagged — these give bonus savings.

    Returns the full step-by-step reduction plan + final adjusted appliance list.
    Frontend can show this as a real-time preview before the user clicks Apply.
    """

    def post(self, request):
        serializer = OptimizeAppliancesSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        user = request.user

        appliances = list(data["appliances"])

        # ── Billing-cycle context ────────────────────────────────────────────────
        already_consumed = float(data.get("already_consumed_units") or 0.0)
        remaining_days   = int(data.get("remaining_days") or 30)

        # Resolve budget
        budget_pkr = data.get("budget_pkr")
        budget_units = data.get("budget_units")
        budget = getattr(user, "budget", None)
        if not budget_pkr and budget:
            budget_pkr = float(budget.max_pkr)
        if not budget_units and budget:
            budget_units = budget.max_units

        if not budget_pkr and not budget_units:
            return Response(
                {
                    "detail": "Budget not configured. Set a budget via /budget/ "
                              "or pass budget_pkr in the request."
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # ── Scale appliances for the recommender ─────────────────────────────────
        # The recommender internally uses DAYS_PER_MONTH = 30 for all calculations.
        # To make it produce correct remaining-days figures we scale each appliance's
        # wattage_w by (remaining_days / 30).  That way:
        #   units_saved_by_reduction(scaled_app, hrs)
        #     = (scaled_wattage / 1000) * hrs * qty * 30
        #     = (original_wattage / 1000) * hrs * qty * remaining_days  ✓
        scale = remaining_days / 30.0

        scaled_appliances = []
        for a in appliances:
            scaled = dict(a)
            scaled["wattage_w"]    = a["wattage_w"] * scale
            scaled["monthly_units"] = round(
                a["wattage_w"] / 1000 * a["hours_per_day"] * a.get("quantity", 1) * remaining_days, 2
            )
            scaled_appliances.append(scaled)

        appliance_units = sum(a["monthly_units"] for a in scaled_appliances)
        # Total starting point: IoT already consumed + remaining appliance usage
        total_units = int(already_consumed + appliance_units)

        # Run the auto-suggest optimization against the full projected total.
        # The optimizer will find appliance hour cuts until bill(total) ≤ budget_pkr.
        suggestions = run_auto_suggest(
            appliances=scaled_appliances,
            predicted_units=total_units,
            bill_kwargs=user.bill_kwargs,
            budget_pkr=budget_pkr,
            budget_units=budget_units,
        )

        # Build the optimized appliance list with adjusted hours.
        # Use original (unscaled) wattage for the displayed units figure.
        hour_cuts = {s["name"]: s["hours_reduced"] for s in suggestions}
        optimized = []
        for app in appliances:
            cut       = hour_cuts.get(app["name"], 0)
            new_hours = max(0.0, app["hours_per_day"] - cut)
            new_units = round(
                (app["wattage_w"] / 1000) * new_hours * app.get("quantity", 1) * remaining_days, 2
            )
            orig_units = round(
                app["wattage_w"] / 1000 * app["hours_per_day"] * app.get("quantity", 1) * remaining_days, 2
            )
            optimized.append(
                {
                    **app,
                    "original_hours_per_day":  app["hours_per_day"],
                    "optimized_hours_per_day": round(new_hours, 2),
                    "hours_reduced":           round(cut, 2),
                    "original_monthly_units":  orig_units,
                    "optimized_monthly_units": new_units,
                    "changed": cut > 0,
                }
            )

        original_bill = calculate_tariff_bill(total_units, **user.bill_kwargs)["total_payable"]
        if suggestions:
            final_units = suggestions[-1]["new_total_units"]
            final_bill  = suggestions[-1]["new_bill"]
        else:
            final_units = total_units
            final_bill  = original_bill

        return Response(
            {
                "optimization_steps": suggestions,  # step-by-step reduction log
                "optimized_appliances": optimized,
                "summary": {
                    "already_consumed_units": round(already_consumed, 2),
                    "remaining_days": remaining_days,
                    "original_units":   round(total_units, 1),
                    "original_bill_pkr": original_bill,
                    "final_units":      final_units,
                    "final_bill_pkr":   final_bill,
                    "units_saved":      round(total_units - final_units, 1),
                    "pkr_saved":        round(original_bill - final_bill, 2),
                    "budget_met":       (budget_pkr is None or final_bill <= budget_pkr),
                    "budget_pkr":       budget_pkr,
                },
                "message": (
                    "Optimization complete! Click Apply to save these adjusted hours."
                    if (budget_pkr is None or final_bill <= budget_pkr)
                    else
                    f"Could not fully meet budget. Best achievable: Rs {final_bill:,.0f} "
                    f"(budget: Rs {budget_pkr:,.0f}). Consider adding more appliances to the list."
                ),
            }
        )


class OptimizeApplyView(APIView):
    """
    POST /api/v1/appliances/optimize/apply/
    Persist the optimized hours to the database.
    Body: {"adjustments": [{"id": 3, "hours_per_day": 5.5}, ...]}
    """

    def post(self, request):
        serializer = OptimizeApplySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        updated = []
        errors = []
        for adj in serializer.validated_data["adjustments"]:
            app_id = adj.get("id")
            new_hours = adj.get("hours_per_day")
            if app_id is None or new_hours is None:
                errors.append(f"Missing id or hours_per_day in: {adj}")
                continue
            try:
                app = UserAppliance.objects.get(pk=app_id, user=request.user)
                app.hours_per_day = max(0.0, float(new_hours))
                app.save(update_fields=["hours_per_day", "updated_at"])
                updated.append({
                    "id": app.id, "name": app.name,
                    "hours_per_day": app.hours_per_day,
                    "monthly_units": round(app.monthly_units(), 2),
                })
            except UserAppliance.DoesNotExist:
                errors.append(f"Appliance id={app_id} not found.")

        return Response(
            {
                "updated": updated,
                "count": len(updated),
                "errors": errors,
                "message": f"Updated {len(updated)} appliances. Your budget analysis will refresh automatically.",
            }
        )


# ── Helpers ────────────────────────────────────────────────────────────────────

def _slab_boundary_alerts(total_units: int, user) -> list:
    """
    Check if the user is just above a tariff slab boundary.
    Cutting a few units could drop them into a cheaper slab (LESCO non-telescoping).
    """
    slab_boundaries = [100, 200, 300, 400, 500, 600, 700]
    alerts = []
    for boundary in slab_boundaries:
        if 0 < total_units - boundary <= 30:
            # Very close above a boundary — big savings possible
            units_to_cut = total_units - boundary
            bill_now = calculate_tariff_bill(total_units, **user.bill_kwargs)["total_payable"]
            bill_below = calculate_tariff_bill(boundary, **user.bill_kwargs)["total_payable"]
            saving = bill_now - bill_below
            alerts.append(
                {
                    "boundary": boundary,
                    "units_above_boundary": units_to_cut,
                    "potential_saving_pkr": round(saving, 2),
                    "message": (
                        f"⚡ You are only {units_to_cut} units above the {boundary}-unit slab boundary! "
                        f"Cutting {units_to_cut} units saves Rs {saving:,.0f}/month "
                        f"(not just {units_to_cut} × rate — the WHOLE bill drops to the cheaper slab)."
                    ),
                }
            )
    return alerts
