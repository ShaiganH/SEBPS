from django.conf import settings
from django.db import models


class Recommendation(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="recommendations"
    )
    prediction_id = models.IntegerField(null=True, blank=True)

    # Full output from recommender.analyse()
    analysis = models.JSONField()

    # Quick summary fields
    predicted_units = models.IntegerField()
    predicted_bill_pkr = models.DecimalField(max_digits=10, decimal_places=2)
    budget_pkr = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    units_gap = models.IntegerField(default=0)
    pkr_gap = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    within_budget = models.BooleanField(default=False)

    applied = models.BooleanField(default=False)
    applied_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "recommendations"
        ordering = ["-created_at"]

    def __str__(self):
        return f"Rec #{self.pk} – {self.user.email}"


class ReductionPlan(models.Model):
    recommendation = models.ForeignKey(
        Recommendation, on_delete=models.CASCADE, related_name="reductions"
    )
    appliance_name = models.CharField(max_length=100)
    hours_reduced = models.FloatField()
    units_saved = models.FloatField()
    pkr_saved = models.DecimalField(max_digits=10, decimal_places=2)
    new_total_units = models.IntegerField()
    new_bill_pkr = models.DecimalField(max_digits=10, decimal_places=2)
    slab_crossed = models.BooleanField(default=False)

    class Meta:
        db_table = "reduction_plans"
