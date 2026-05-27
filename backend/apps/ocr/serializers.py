from rest_framework import serializers

from .models import OCRJob


class OCRJobSerializer(serializers.ModelSerializer):
    class Meta:
        model = OCRJob
        fields = [
            "id", "status", "celery_task_id",
            "extracted_ref_no", "confidence", "method",
            "variants_run", "raw_result", "error_message",
            "created_at", "completed_at",
        ]
        read_only_fields = fields


class OCRUploadSerializer(serializers.Serializer):
    image = serializers.ImageField(
        help_text="Electricity bill image (JPEG/PNG, max 10 MB)"
    )
    # Default False so user sees extracted ref_no before fetch is triggered.
    # Set True to auto-fetch immediately (e.g. when confidence is very high).
    auto_fetch = serializers.BooleanField(
        default=False,
        help_text="Auto-trigger LESCO fetch immediately after extraction (skip user confirmation)",
    )


class OCRConfirmSerializer(serializers.Serializer):
    """
    User confirms (or corrects) the OCR-extracted reference number.
    Triggers the LESCO fetch job.
    """
    ref_no = serializers.CharField(
        max_length=20,
        help_text="Confirmed LESCO reference number (15 alphanumeric chars)",
    )
