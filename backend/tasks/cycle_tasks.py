"""
billing_cycle_rollover — daily Celery-beat task (00:05 Asia/Karachi).

For every user whose billing_cycle_day equals today's calendar day:

  1. Log a CycleSummary for the cycle that just ENDED (yesterday was the last day).
  2. Send the user a notification with their cycle highlights:
       • IoT-measured consumption vs budget
       • How much they saved (or overspent) vs their budget
       • Prediction accuracy for the cycle
  3. Kick off the next-cycle data pipeline:
       • If user has a ref_no → create a LescoFetchJob and fire run_lesco_fetch,
         which automatically chains into auto_predict_for_user.
       • Otherwise → fire auto_predict_for_user directly so there is always a
         fresh baseline prediction on day 1 of the new cycle.
"""

import logging
from datetime import date, timedelta

from celery import shared_task
from django.utils import timezone

logger = logging.getLogger(__name__)


@shared_task
def billing_cycle_rollover():
    """
    Entry point scheduled by Celery beat (see CELERY_BEAT_SCHEDULE in settings).
    Finds all users whose billing cycle starts today and processes each one.
    """
    from django.contrib.auth import get_user_model

    User = get_user_model()

    now   = timezone.now()
    today = now.date()

    # Find every user whose cycle begins today
    users = User.objects.filter(billing_cycle_day=today.day, is_active=True)
    logger.info(
        f"billing_cycle_rollover: {today} — found {users.count()} user(s) with "
        f"billing_cycle_day={today.day}"
    )

    for user in users:
        try:
            _process_user_rollover(user, now)
        except Exception as exc:
            logger.exception(f"Rollover failed for user {user.id} ({user.email}): {exc}")


# ─────────────────────────────────────────────────────────────────────────────

def _process_user_rollover(user, now):
    """Handle the full rollover sequence for a single user."""
    from services.billing_utils import get_billing_cycle

    today = now.date()

    # ── 1. Identify the just-ended cycle ──────────────────────────────────────
    # Today is Day 1 of the NEW cycle.  Yesterday (now - 1d) was the last day
    # of the OLD cycle.  get_billing_cycle() with yesterday's date returns the
    # old cycle's billing_start.
    yesterday      = now - timedelta(days=1)
    old_cycle      = get_billing_cycle(user, now=yesterday)
    old_start      = old_cycle["billing_start"]          # e.g. 2026-04-22 00:00 PKT
    old_start_date = old_start.date()                    # 2026-04-22
    old_end_date   = today - timedelta(days=1)           # 2026-05-21
    old_total_days = old_cycle["total_cycle_days"]

    # ── 2. Skip if we already logged this cycle ────────────────────────────────
    from apps.budget.models import CycleSummary
    if CycleSummary.objects.filter(user=user, cycle_start=old_start_date).exists():
        logger.info(f"User {user.id}: CycleSummary for {old_start_date} already exists, skipping.")
    else:
        _create_cycle_summary(user, old_start, old_start_date, old_end_date, old_total_days)

    # ── 3. Kick off next-cycle data pipeline ──────────────────────────────────
    if user.ref_no:
        _trigger_lesco_fetch(user)
    else:
        from tasks.prediction_tasks import auto_predict_for_user
        auto_predict_for_user.delay(user_id=user.id)
        logger.info(f"User {user.id}: no ref_no — auto_predict_for_user triggered directly.")


def _create_cycle_summary(user, old_start, old_start_date, old_end_date, total_cycle_days):
    """Query all sources and persist a CycleSummary for the completed cycle."""
    from apps.bills.models import BillRecord
    from apps.budget.models import Budget, CycleSummary
    from apps.predictions.models import Prediction
    from django.utils import timezone

    # ── IoT: Max–Min energy between old_start and midnight today ─────────────
    iot_units_kwh = None
    iot_bill_pkr  = None
    try:
        from apps.iot.models import IoTDevice, IoTReading
        from django.db.models import Max, Min

        new_cycle_start = timezone.now().replace(
            hour=0, minute=0, second=0, microsecond=0
        )
        device = IoTDevice.objects.filter(user=user, is_active=True).first()
        if device:
            agg = IoTReading.objects.filter(
                device=device,
                time__gte=old_start,
                time__lt=new_cycle_start,
            ).aggregate(max_e=Max("energy"), min_e=Min("energy"))
            if agg["max_e"] is not None:
                delta = max(0.0, (agg["max_e"] or 0.0) - (agg["min_e"] or 0.0))
                iot_units_kwh = round(delta, 4)
                if iot_units_kwh > 0:
                    from services.iot_service import _kwh_to_pkr
                    iot_bill_pkr = round(_kwh_to_pkr(iot_units_kwh, user), 2)
    except Exception as exc:
        logger.warning(f"User {user.id}: IoT query failed in rollover: {exc}")

    # ── Most recent BillRecord (proxy for actual LESCO bill) ──────────────────
    bill_units      = None
    bill_amount_pkr = None
    try:
        latest_bill = BillRecord.objects.filter(user=user).first()
        if latest_bill:
            bill_units      = latest_bill.units
            bill_amount_pkr = float(latest_bill.bill_amount)
    except Exception as exc:
        logger.warning(f"User {user.id}: BillRecord query failed: {exc}")

    # ── Most recent Prediction made before the cycle ended ────────────────────
    predicted_units    = None
    predicted_bill_pkr = None
    try:
        pred = Prediction.objects.filter(user=user).first()  # ordered by -created_at
        if pred:
            predicted_units    = pred.predicted_units
            predicted_bill_pkr = float(pred.predicted_bill)
    except Exception as exc:
        logger.warning(f"User {user.id}: Prediction query failed: {exc}")

    # ── Budget snapshot ────────────────────────────────────────────────────────
    budget_pkr = None
    try:
        budget = getattr(user, "budget", None)
        if budget:
            budget_pkr = float(budget.max_pkr)
    except Exception as exc:
        logger.warning(f"User {user.id}: Budget query failed: {exc}")

    # ── Savings vs budget ──────────────────────────────────────────────────────
    # Prefer IoT bill (most accurate) over LESCO record for savings calculation.
    savings_pkr = None
    actual_for_savings = iot_bill_pkr or bill_amount_pkr
    if budget_pkr and actual_for_savings is not None:
        savings_pkr = round(budget_pkr - actual_for_savings, 2)

    # ── Persist ────────────────────────────────────────────────────────────────
    summary = CycleSummary.objects.create(
        user=user,
        cycle_start=old_start_date,
        cycle_end=old_end_date,
        total_cycle_days=total_cycle_days,
        budget_pkr=budget_pkr,
        iot_units_kwh=iot_units_kwh,
        iot_bill_pkr=iot_bill_pkr,
        bill_units=bill_units,
        bill_amount_pkr=bill_amount_pkr,
        predicted_units=predicted_units,
        predicted_bill_pkr=predicted_bill_pkr,
        savings_pkr=savings_pkr,
    )
    logger.info(
        f"User {user.id}: CycleSummary #{summary.id} created — "
        f"{old_start_date} → {old_end_date}, IoT {iot_units_kwh} kWh, "
        f"savings Rs {savings_pkr}"
    )

    # ── Send summary notification ──────────────────────────────────────────────
    _send_cycle_notification(user, summary)


def _send_cycle_notification(user, summary):
    """Build a human-readable cycle-end notification and persist it."""
    try:
        from apps.notifications.models import Notification

        lines = [
            f"📅 Cycle: {summary.cycle_start.strftime('%d %b')} – "
            f"{summary.cycle_end.strftime('%d %b %Y')} ({summary.total_cycle_days} days)",
        ]

        # Consumption
        if summary.iot_units_kwh is not None:
            lines.append(
                f"⚡ Consumed: {summary.iot_units_kwh:.1f} kWh  →  "
                f"Rs {summary.iot_bill_pkr:,.0f} (IoT measured)"
            )
        elif summary.bill_units is not None:
            lines.append(
                f"📋 Last LESCO bill: {summary.bill_units} units  →  "
                f"Rs {summary.bill_amount_pkr:,.0f}"
            )

        # Budget & savings
        if summary.budget_pkr is not None:
            lines.append(f"💰 Budget: Rs {summary.budget_pkr:,.0f}")
            if summary.savings_pkr is not None:
                if summary.savings_pkr >= 0:
                    lines.append(f"✅ Saved: Rs {summary.savings_pkr:,.0f} under budget!")
                else:
                    lines.append(
                        f"⚠️  Over budget by Rs {abs(summary.savings_pkr):,.0f}"
                    )

        # Prediction accuracy
        if summary.predicted_units is not None and summary.bill_units is not None:
            accuracy = round(
                100 - abs(summary.predicted_units - summary.bill_units) / summary.bill_units * 100,
                1,
            )
            lines.append(f"🎯 Prediction accuracy: {accuracy}%")

        lines.append("🔄 New cycle started — fresh prediction on the way!")

        Notification.objects.create(
            user=user,
            type="cycle_summary",
            title=f"Billing Cycle Complete – {summary.cycle_start.strftime('%d %b')} to "
                  f"{summary.cycle_end.strftime('%d %b')}",
            message="\n".join(lines),
            data={
                "cycle_summary_id": summary.id,
                "cycle_start": str(summary.cycle_start),
                "cycle_end":   str(summary.cycle_end),
                "savings_pkr": float(summary.savings_pkr) if summary.savings_pkr else None,
            },
        )
        logger.info(f"User {user.id}: cycle summary notification sent.")
    except Exception as exc:
        logger.warning(f"User {user.id}: failed to send cycle notification: {exc}")


def _trigger_lesco_fetch(user):
    """Create a LescoFetchJob and queue run_lesco_fetch (which chains into auto_predict)."""
    try:
        from apps.bills.models import LescoFetchJob
        from tasks.fetch_tasks import run_lesco_fetch

        job = LescoFetchJob.objects.create(user=user, ref_no=user.ref_no)
        task = run_lesco_fetch.delay(job.id)
        job.celery_task_id = task.id
        job.status = LescoFetchJob.STATUS_RUNNING
        job.save(update_fields=["celery_task_id", "status"])
        logger.info(
            f"User {user.id}: LescoFetchJob #{job.id} queued "
            f"(ref_no={user.ref_no}, task={task.id})"
        )
    except Exception as exc:
        # Fetch failure must not block the rollover — fall back to direct predict
        logger.error(f"User {user.id}: LESCO fetch trigger failed: {exc}. Falling back to direct predict.")
        from tasks.prediction_tasks import auto_predict_for_user
        auto_predict_for_user.delay(user_id=user.id)
