from rest_framework import serializers

from .models import Prediction


class PredictionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Prediction
        fields = [
            "id", "units_so_far", "days_elapsed", "total_cycle_days",
            "fpa_per_unit", "qta_per_unit", "sanctioned_load_kw",
            "is_protected", "is_tax_filer", "phase",
            "predicted_units", "predicted_bill", "primary_source",
            "result", "created_at",
        ]
        read_only_fields = fields


class GeneratePredictionSerializer(serializers.Serializer):
    # All three are optional — when omitted the view auto-populates from IoT / calendar
    units_so_far     = serializers.FloatField(min_value=0, required=False)
    days_elapsed     = serializers.IntegerField(min_value=0, max_value=31, required=False)
    total_cycle_days = serializers.IntegerField(min_value=28, max_value=31, required=False)

    # Optional overrides (falls back to user profile)
    fpa_per_unit = serializers.FloatField(required=False)
    qta_per_unit = serializers.FloatField(required=False)
    sanctioned_load_kw = serializers.FloatField(required=False)
    is_protected = serializers.BooleanField(required=False)
    is_tax_filer = serializers.BooleanField(required=False)
    phase = serializers.ChoiceField(
        choices=["single_phase", "three_phase"], required=False
    )
