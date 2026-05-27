from django.conf import settings
from django.db import models


class CycleSummary(models.Model):
    """
    One record per completed billing cycle per user.

    Written at 00:05 on the first day of each new billing cycle by the
    ``billing_cycle_rollover`` Celery-beat task.  Captures what actually
    happened during the cycle so users can review their history.
    """

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="cycle_summaries",
    )

    # Cycle window
    cycle_start = models.DateField(help_text="First day of the completed cycle")
    cycle_end   = models.DateField(help_text="Last day of the completed cycle (day before new cycle)")
    total_cycle_days = models.IntegerField()

    # Budget at the time of cycle end (snapshot from Budget record)
    budget_pkr = models.DecimalField(
        max_digits=10, decimal_places=2, null=True, blank=True,
        help_text="User's monthly PKR budget for this cycle",
    )

    # IoT-measured actual consumption (Max–Min since cycle start)
    iot_units_kwh = models.FloatField(null=True, blank=True)
    iot_bill_pkr  = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)

    # LESCO bill record (may not exist yet at rollover time; can be backfilled)
    bill_units     = models.IntegerField(null=True, blank=True)
    bill_amount_pkr = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)

    # Prediction snapshot (most recent prediction made during the cycle)
    predicted_units    = models.IntegerField(null=True, blank=True)
    predicted_bill_pkr = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)

    # Savings vs budget  (budget_pkr − iot_bill_pkr, positive = under budget)
    savings_pkr = models.DecimalField(
        max_digits=10, decimal_places=2, null=True, blank=True,
        help_text="Positive = spent less than budget; negative = overspent",
    )

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "cycle_summaries"
        unique_together = ("user", "cycle_start")
        ordering = ["-cycle_start"]

    def __str__(self):
        return f"{self.user.email} cycle {self.cycle_start} → {self.cycle_end}"


class Budget(models.Model):
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="budget"
    )
    max_pkr = models.DecimalField(max_digits=10, decimal_places=2)
    max_units = models.IntegerField(null=True, blank=True)
    alert_at_75_pct = models.BooleanField(default=True)
    alert_at_100_pct = models.BooleanField(default=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "budgets"

    def __str__(self):
        return f"{self.user.email} budget – Rs {self.max_pkr}"


class BudgetAlert(models.Model):
    THRESHOLD_75 = 75
    THRESHOLD_100 = 100
    THRESHOLD_CHOICES = [(75, "75%"), (100, "100%")]

    budget = models.ForeignKey(Budget, on_delete=models.CASCADE, related_name="alerts")
    threshold_pct = models.IntegerField(choices=THRESHOLD_CHOICES)
    triggered_at = models.DateTimeField(auto_now_add=True)
    consumed_units = models.IntegerField()
    consumed_pkr = models.DecimalField(max_digits=10, decimal_places=2)

    class Meta:
        db_table = "budget_alerts"
        ordering = ["-triggered_at"]

    def __str__(self):
        return f"{self.budget.user.email} – {self.threshold_pct}% alert"
