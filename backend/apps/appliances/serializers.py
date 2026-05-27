from rest_framework import serializers

from .models import ApplianceCatalog, UserAppliance


class ApplianceCatalogSerializer(serializers.ModelSerializer):
    class Meta:
        model = ApplianceCatalog
        fields = ["id", "name", "category", "wattage_w", "typical_hours_per_day", "description"]


class UserApplianceSerializer(serializers.ModelSerializer):
    monthly_units = serializers.SerializerMethodField()

    class Meta:
        model = UserAppliance
        fields = [
            "id", "catalog_item", "name", "wattage_w",
            "hours_per_day", "quantity", "category",
            "is_active", "monthly_units", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "monthly_units", "created_at", "updated_at"]

    def get_monthly_units(self, obj):
        return round(obj.monthly_units(), 2)

    def create(self, validated_data):
        validated_data["user"] = self.context["request"].user
        return super().create(validated_data)


# ── Inline appliance input (for analyze / optimize — not saved to DB) ──────────

class ApplianceInputSerializer(serializers.Serializer):
    """Represents a single appliance submitted inline (may or may not be saved)."""
    id = serializers.IntegerField(required=False, help_text="DB id — required for apply-optimize")
    name = serializers.CharField(max_length=100)
    wattage_w = serializers.FloatField(min_value=0)
    hours_per_day = serializers.FloatField(min_value=0, max_value=24)
    quantity = serializers.IntegerField(min_value=1, default=1)
    category = serializers.CharField(max_length=50, default="Custom")

    def to_internal_value(self, data):
        result = super().to_internal_value(data)
        result["monthly_units"] = round(
            (result["wattage_w"] / 1000) * result["hours_per_day"] * result["quantity"] * 30, 2
        )
        return result


class AnalyzeAppliancesSerializer(serializers.Serializer):
    """
    POST /api/v1/appliances/analyze/
    Real-time impact calculation — nothing is saved.
    """
    appliances = ApplianceInputSerializer(many=True)
    budget_pkr = serializers.FloatField(required=False, min_value=0)
    budget_units = serializers.IntegerField(required=False, min_value=0)
    use_saved_appliances = serializers.BooleanField(
        default=False,
        help_text="If True, merge the request appliances with the user's saved appliances",
    )
    # IoT billing-cycle context — when provided, appliance kWh is computed for
    # remaining_days only and added to already_consumed_units so the projected
    # bill correctly reflects mid-cycle state.
    already_consumed_units = serializers.FloatField(
        required=False, min_value=0, default=0.0,
        help_text="IoT-measured kWh already consumed this billing cycle",
    )
    remaining_days = serializers.IntegerField(
        required=False, min_value=1, max_value=31, default=30,
        help_text="Days remaining in the billing cycle (default 30 = full month)",
    )


class OptimizeAppliancesSerializer(serializers.Serializer):
    """
    POST /api/v1/appliances/optimize/
    Auto-adjust hours to meet budget — nothing is saved.
    """
    appliances = ApplianceInputSerializer(many=True)
    budget_pkr = serializers.FloatField(required=False, min_value=1)
    budget_units = serializers.IntegerField(required=False, min_value=1)
    # IoT billing-cycle context — same semantics as AnalyzeAppliancesSerializer
    already_consumed_units = serializers.FloatField(
        required=False, min_value=0, default=0.0,
    )
    remaining_days = serializers.IntegerField(
        required=False, min_value=1, max_value=31, default=30,
    )


class OptimizeApplySerializer(serializers.Serializer):
    """
    POST /api/v1/appliances/optimize/apply/
    Persist optimized hours to the DB.
    """
    adjustments = serializers.ListField(
        child=serializers.DictField(),
        help_text='[{"id": 3, "hours_per_day": 5.5}, ...]',
    )
