import logging

from celery import shared_task

logger = logging.getLogger(__name__)


@shared_task
def check_budget_thresholds(user_id: int, current_units: int, current_bill_pkr: float):
    """
    Called after each IoT reading batch or prediction.
    Checks if user has crossed 75% or 100% budget threshold and creates alerts.
    """
    from apps.budget.models import Budget, BudgetAlert
    from apps.notifications.models import Notification

    try:
        budget = Budget.objects.get(user_id=user_id, is_active=True)
    except Budget.DoesNotExist:
        return

    max_pkr = float(budget.max_pkr)
    pct_used = (current_bill_pkr / max_pkr * 100) if max_pkr > 0 else 0

    thresholds = []
    if pct_used >= 100 and budget.alert_at_100_pct:
        thresholds.append((100, "Budget Exceeded!",
                           f"Your projected bill of Rs {current_bill_pkr:,.0f} has exceeded your budget of Rs {max_pkr:,.0f}."))
    elif pct_used >= 75 and budget.alert_at_75_pct:
        thresholds.append((75, "75% Budget Used",
                           f"You have used 75% of your monthly budget. Projected bill: Rs {current_bill_pkr:,.0f}."))

    for threshold_pct, title, message in thresholds:
        # Deduplicate: don't alert the same threshold twice this month
        from django.utils import timezone
        from datetime import timedelta
        recent = BudgetAlert.objects.filter(
            budget=budget,
            threshold_pct=threshold_pct,
            triggered_at__gte=timezone.now() - timedelta(days=1),
        ).exists()
        if recent:
            continue

        BudgetAlert.objects.create(
            budget=budget,
            threshold_pct=threshold_pct,
            consumed_units=current_units,
            consumed_pkr=current_bill_pkr,
        )
        Notification.objects.create(
            user_id=user_id,
            type="budget_alert",
            title=title,
            message=message,
            data={"threshold_pct": threshold_pct, "current_bill": current_bill_pkr},
        )
        logger.info(f"Budget alert {threshold_pct}% sent for user #{user_id}")


@shared_task
def send_push_notification(user_id: int, title: str, body: str, data: dict = None):
    """Placeholder for FCM/APNS push notification dispatch."""
    from django.contrib.auth import get_user_model
    User = get_user_model()
    try:
        user = User.objects.get(pk=user_id)
        if not user.push_token:
            return
        # TODO: integrate Firebase Admin SDK or Expo push
        logger.info(f"Push notification to {user.email}: {title} — {body}")
    except User.DoesNotExist:
        pass
