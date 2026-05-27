from rest_framework import serializers

from .models import Budget, BudgetAlert


class BudgetSerializer(serializers.ModelSerializer):
    class Meta:
        model = Budget
        fields = [
            "id", "max_pkr", "max_units",
            "alert_at_75_pct", "alert_at_100_pct", "is_active",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class BudgetAlertSerializer(serializers.ModelSerializer):
    class Meta:
        model = BudgetAlert
        fields = ["id", "threshold_pct", "triggered_at", "consumed_units", "consumed_pkr"]
        read_only_fields = fields
