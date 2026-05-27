from django.conf import settings
from django.db import models


class Prediction(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="predictions"
    )

    # Inputs
    units_so_far = models.IntegerField()
    days_elapsed = models.IntegerField()
    total_cycle_days = models.IntegerField(default=30)

    # Tariff overrides at prediction time (snapshot so history stays accurate)
    fpa_per_unit = models.FloatField()
    qta_per_unit = models.FloatField()
    sanctioned_load_kw = models.FloatField()
    is_protected = models.BooleanField()
    is_tax_filer = models.BooleanField()
    phase = models.CharField(max_length=15)

    # Full output from predictor.predict()
    result = models.JSONField()

    # Quick-access denormalized fields
    predicted_units = models.IntegerField()
    predicted_bill = models.DecimalField(max_digits=10, decimal_places=2)
    primary_source = models.CharField(max_length=30, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "predictions"
        ordering = ["-created_at"]

    def __str__(self):
        return f"Prediction #{self.pk} – {self.user.email} – {self.predicted_units} units"
