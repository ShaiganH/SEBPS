"""
Celery tasks for automatic prediction generation and smart budget recommendations.
Triggered automatically after bills are fetched or IoT data arrives.
"""

import logging

from celery import shared_task

logger = logging.getLogger(__name__)


@shared_task(bind=True)
def auto_predict_for_user(self, user_id: int):
    """
    Automatically generate a bill prediction right after LESCO history is fetched.
    Uses day-15/30 as a neutral cycle-progress estimate when no IoT data exists.
    Then checks budget and triggers smart_recommendation_for_user.
    """
    from django.contrib.auth import get_user_model
    from django.utils import timezone

    from apps.bills.models import BillRecord
    from apps.iot.models import IoTDevice, IoTReading
    from apps.notifications.models import Notification
    from apps.predictions.models import Prediction
    from services.predictor_service import run_prediction

    User = get_user_model()
    try:
        user = User.objects.get(pk=user_id)
    except User.DoesNotExist:
        return

    bills = BillRecord.objects.filter(user=user).order_by("year", "mon_idx")
    if bills.count() < 2:
        logger.info(f"User {user_id}: not enough bills for prediction ({bills.count()} months).")
        return

    history_units = [b.units for b in bills[:12]]

    # ── Live usage from IoT (billing-cycle aware) ─────────────────────────────
    from django.db.models import Max, Min
    from services.billing_utils import get_billing_cycle

    now = timezone.now()
    cycle = get_billing_cycle(user, now=now)
    days_elapsed     = cycle["days_elapsed"]
    total_cycle_days = cycle["total_cycle_days"]
    units_so_far = 0.0

    device = IoTDevice.objects.filter(user=user, is_active=True).first()
    if device:
        from datetime import timedelta

        billing_start = cycle["billing_start"]

        # ── Actual consumed this cycle (for display) ──────────────────────────
        cycle_agg = IoTReading.objects.filter(
            device=device, time__gte=billing_start
        ).aggregate(
            max_e=Max("energy"),
            min_e=Min("energy"),
            first_time=Min("time"),
            last_time=Max("time"),
        )
        if cycle_agg["max_e"] is not None:
            measured_kwh = max(0.0, (cycle_agg["max_e"] or 0.0) - (cycle_agg["min_e"] or 0.0))
            total_runtime = 0.0
            if cycle_agg["first_time"] and cycle_agg["last_time"]:
                total_runtime = max(
                    (cycle_agg["last_time"] - cycle_agg["first_time"]).total_seconds() / 3600,
                    1 / 60,
                )

            # ── Rolling 2-hour window for current rate ─────────────────────────
            # Responds to power changes within 2h instead of days (full-cycle avg).
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
                if rate_agg["first_time"] and rate_agg["last_time"] and window_kwh > 0:
                    window_runtime = max(
                        (rate_agg["last_time"] - rate_agg["first_time"]).total_seconds() / 3600,
                        1 / 60,
                    )
                    daily_rate = (window_kwh / window_runtime) * 24

            # Fallback to full-cycle rate if window has no data
            if daily_rate == 0.0 and measured_kwh > 0 and total_runtime > 0:
                daily_rate = (measured_kwh / total_runtime) * 24

            units_so_far = daily_rate * days_elapsed

    try:
        result = run_prediction(
            history_units=history_units,
            units_so_far=round(units_so_far, 3),
            days_elapsed=days_elapsed,
            total_cycle_days=total_cycle_days,
            **user.bill_kwargs,
        )
    except Exception as exc:
        logger.error(f"Auto-prediction failed for user {user_id}: {exc}")
        return

    prediction = Prediction.objects.create(
        user=user,
        units_so_far=round(units_so_far, 3),
        days_elapsed=days_elapsed,
        total_cycle_days=total_cycle_days,
        fpa_per_unit=user.fpa_per_unit,
        qta_per_unit=user.qta_per_unit,
        sanctioned_load_kw=user.sanctioned_load_kw,
        is_protected=user.is_protected_consumer,
        is_tax_filer=user.is_tax_filer,
        phase=user.phase,
        result=result,
        predicted_units=result["prediction"]["units"],
        predicted_bill=result["prediction"]["bill"]["total_payable"],
        primary_source=result["confidence"]["primary_source"],
    )

    Notification.objects.create(
        user=user,
        type="prediction_ready",
        title="Bill Prediction Ready",
        message=(
            f"Estimated bill: Rs {prediction.predicted_bill:,.0f} "
            f"({prediction.predicted_units} units). "
            f"Primary model: {prediction.primary_source}."
        ),
        data={"prediction_id": prediction.id},
    )

    logger.info(
        f"Auto-prediction for user {user_id}: "
        f"{prediction.predicted_units} units → Rs {prediction.predicted_bill}"
    )

    # Check budget and fire smart recommendation
    smart_recommendation_for_user.delay(user_id=user_id, prediction_id=prediction.id)

    return {"prediction_id": prediction.id, "predicted_units": prediction.predicted_units}


@shared_task
def smart_recommendation_for_user(user_id: int, prediction_id: int):
    """
    After a prediction, check budget thresholds and generate context-aware
    GROQ + rule-based recommendations. Creates a Notification with the advice.
    """
    from django.contrib.auth import get_user_model

    from apps.appliances.models import UserAppliance
    from apps.budget.models import Budget, BudgetAlert
    from apps.notifications.models import Notification
    from apps.predictions.models import Prediction
    from apps.recommendations.models import Recommendation
    from services.recommender_service import run_analysis, run_auto_suggest

    User = get_user_model()
    try:
        user = User.objects.get(pk=user_id)
        prediction = Prediction.objects.get(pk=prediction_id)
    except (User.DoesNotExist, Prediction.DoesNotExist):
        return

    budget = getattr(user, "budget", None)
    if not budget or not budget.is_active:
        return

    budget_pkr = float(budget.max_pkr)
    predicted_bill = float(prediction.predicted_bill)
    pct_used = (predicted_bill / budget_pkr * 100) if budget_pkr > 0 else 0

    # Determine situation bucket
    if pct_used >= 100:
        situation = "exceeded"
        urgency = "🔴 OVER BUDGET"
    elif pct_used >= 75:
        situation = "approaching"
        urgency = "🟡 APPROACHING BUDGET"
    elif pct_used >= 50:
        situation = "midway"
        urgency = "🟢 ON TRACK"
    else:
        situation = "well_within"
        urgency = "✅ WELL WITHIN BUDGET"

    # Only alert when approaching or exceeded
    if situation not in ("exceeded", "approaching"):
        logger.info(f"User {user_id}: {pct_used:.0f}% of budget — no alert needed.")
        return

    # Deduplicate: don't send same alert twice within 24h
    from datetime import timedelta
    from django.utils import timezone
    threshold_pct = 100 if situation == "exceeded" else 75
    if BudgetAlert.objects.filter(
        budget=budget,
        threshold_pct=threshold_pct,
        triggered_at__gte=timezone.now() - timedelta(hours=24),
    ).exists():
        return

    BudgetAlert.objects.create(
        budget=budget,
        threshold_pct=threshold_pct,
        consumed_units=prediction.predicted_units,
        consumed_pkr=predicted_bill,
    )

    # ── Rule-based analysis (recommender module) ───────────────────────────────
    appliances = list(UserAppliance.objects.filter(user=user, is_active=True))
    rule_message = ""
    groq_message = ""

    if appliances:
        try:
            analysis = run_analysis(
                appliances=appliances,
                predicted_units=prediction.predicted_units,
                predicted_bill=predicted_bill,
                budget_pkr=budget_pkr,
                budget_units=budget.max_units,
                bill_kwargs=user.bill_kwargs,
            )
            # Save recommendation record
            rec = Recommendation.objects.create(
                user=user,
                prediction_id=prediction.id,
                analysis=analysis,
                predicted_units=prediction.predicted_units,
                predicted_bill_pkr=predicted_bill,
                budget_pkr=budget_pkr,
                units_gap=analysis.get("units_gap", 0),
                pkr_gap=analysis.get("pkr_gap", 0),
                within_budget=analysis.get("within_pkr_budget", True),
            )

            # Build rule-based message
            top_apps = analysis.get("appliance_breakdown", [])[:3]
            if top_apps:
                tips = []
                for app in top_apps:
                    save = app.get("bill_drop_per_1hr", 0)
                    tips.append(f"• {app['name']}: cut 1 hr/day → save Rs {save:,.0f}/mo")
                rule_message = (
                    f"{urgency}: Predicted bill Rs {predicted_bill:,.0f} is {pct_used:.0f}% of your "
                    f"Rs {budget_pkr:,.0f} budget.\n\nTop savings opportunities:\n" + "\n".join(tips)
                )
        except Exception as e:
            logger.warning(f"Rule-based analysis failed: {e}")
            rule_message = (
                f"{urgency}: Predicted bill Rs {predicted_bill:,.0f} "
                f"({pct_used:.0f}% of Rs {budget_pkr:,.0f} budget)."
            )

    # ── GROQ-powered recommendation ────────────────────────────────────────────
    try:
        from apps.bills.models import BillRecord
        from services.chatbot_service import build_user_context, sync_chat

        bills = BillRecord.objects.filter(user=user).order_by("year", "mon_idx")
        history_data = {
            "history_units": [b.units for b in bills],
            "raw_rows": [
                {"month": b.month_label, "units": b.units, "bill": int(b.bill_amount)}
                for b in bills
            ],
        } if bills.exists() else None

        appliance_dicts = [
            {
                "name": a.name, "wattage_w": a.wattage_w,
                "hours_per_day": a.hours_per_day, "quantity": a.quantity,
                "category": a.category,
            }
            for a in appliances
        ]

        context = build_user_context(
            ref_no=user.ref_no,
            bill_kwargs=user.bill_kwargs,
            history_data=history_data,
            prediction=prediction.result,
            appliances=appliance_dicts,
            budget_pkr=budget_pkr,
            budget_units=budget.max_units,
        )

        prompt = (
            f"My predicted bill is Rs {predicted_bill:,.0f} which is {pct_used:.0f}% of my "
            f"Rs {budget_pkr:,.0f} monthly budget. "
            + (
                "I am OVER budget. Give me 3 specific appliance-level reductions I can make TODAY "
                "to bring my bill under budget. Mention exact units and rupee savings for each."
                if situation == "exceeded"
                else
                "I am approaching my budget limit. What should I reduce NOW to avoid going over? "
                "Give 2-3 specific, quantified recommendations."
            )
        )

        groq_message = sync_chat(
            messages=[{"role": "user", "content": prompt}],
            context=context,
        )
    except Exception as e:
        logger.warning(f"GROQ recommendation failed: {e}")
        groq_message = ""

    # ── Create notification ────────────────────────────────────────────────────
    full_message = rule_message
    if groq_message:
        full_message += f"\n\n💡 AI Advice:\n{groq_message}"

    Notification.objects.create(
        user=user,
        type="budget_alert",
        title=f"{urgency}: {pct_used:.0f}% of monthly budget used",
        message=full_message or f"Predicted bill Rs {predicted_bill:,.0f} vs budget Rs {budget_pkr:,.0f}.",
        data={
            "prediction_id": prediction_id,
            "pct_used": round(pct_used, 1),
            "situation": situation,
        },
    )

    logger.info(f"Smart recommendation sent to user {user_id} ({situation}: {pct_used:.0f}%)")
