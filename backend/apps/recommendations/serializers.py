from rest_framework import serializers

from .models import Recommendation, ReductionPlan


class ReductionPlanSerializer(serializers.ModelSerializer):
    class Meta:
        model = ReductionPlan
        fields = [
            "appliance_name", "hours_reduced", "units_saved",
            "pkr_saved", "new_total_units", "new_bill_pkr", "slab_crossed",
        ]


class RecommendationSerializer(serializers.ModelSerializer):
    reductions = ReductionPlanSerializer(many=True, read_only=True)

    class Meta:
        model = Recommendation
        fields = [
            "id", "prediction_id", "predicted_units", "predicted_bill_pkr",
            "budget_pkr", "units_gap", "pkr_gap", "within_budget",
            "analysis", "reductions", "applied", "applied_at", "created_at",
        ]
        read_only_fields = fields


class GenerateRecommendationSerializer(serializers.Serializer):
    prediction_id = serializers.IntegerField(required=False, help_text="Use latest prediction if omitted")
    budget_pkr = serializers.FloatField(required=False)
    budget_units = serializers.IntegerField(required=False)


class ApplyReductionsSerializer(serializers.Serializer):
    reductions = serializers.ListField(
        child=serializers.DictField(),
        help_text='[{"name": "AC", "hours_reduced": 2}, ...]',
    )
