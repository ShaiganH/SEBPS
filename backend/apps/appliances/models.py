from django.conf import settings
from django.db import models


class ApplianceCatalog(models.Model):
    """Built-in appliance catalog seeded from module_4_recommender/appliances.py."""

    name = models.CharField(max_length=100)
    category = models.CharField(max_length=50)
    wattage_w = models.FloatField()
    typical_hours_per_day = models.FloatField(default=0)
    description = models.CharField(max_length=200, blank=True)

    class Meta:
        db_table = "appliance_catalog"
        ordering = ["category", "name"]

    def __str__(self):
        return f"{self.name} ({self.wattage_w}W)"


class UserAppliance(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="appliances"
    )
    catalog_item = models.ForeignKey(
        ApplianceCatalog, on_delete=models.SET_NULL, null=True, blank=True
    )
    name = models.CharField(max_length=100)
    wattage_w = models.FloatField()
    hours_per_day = models.FloatField()
    quantity = models.IntegerField(default=1)
    category = models.CharField(max_length=50, default="Custom")
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "user_appliances"
        ordering = ["-wattage_w"]

    def __str__(self):
        return f"{self.user.email} – {self.name} ({self.wattage_w}W)"

    def monthly_units(self) -> float:
        return (self.wattage_w / 1000) * self.hours_per_day * self.quantity * 30
