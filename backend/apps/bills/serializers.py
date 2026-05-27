from rest_framework import serializers

from .models import BillRecord, LescoFetchJob


class BillRecordSerializer(serializers.ModelSerializer):
    class Meta:
        model = BillRecord
        fields = [
            "id", "month_label", "year", "mon_idx",
            "units", "bill_amount", "payment_amount",
            "source", "created_at",
        ]
        read_only_fields = ["id", "created_at"]


class ManualBillSerializer(serializers.ModelSerializer):
    class Meta:
        model = BillRecord
        fields = [
            "month_label", "year", "mon_idx",
            "units", "bill_amount", "payment_amount",
        ]

    def create(self, validated_data):
        validated_data["user"] = self.context["request"].user
        validated_data["source"] = BillRecord.SOURCE_MANUAL
        return super().create(validated_data)


class LescoFetchJobSerializer(serializers.ModelSerializer):
    class Meta:
        model = LescoFetchJob
        fields = [
            "id", "ref_no", "status", "celery_task_id",
            "months_fetched", "error_message", "result_summary",
            "created_at", "completed_at",
        ]
        read_only_fields = fields


class TriggerFetchSerializer(serializers.Serializer):
    ref_no = serializers.CharField(
        max_length=20,
        help_text="LESCO reference number e.g. '08 11274 1172000U'",
    )
