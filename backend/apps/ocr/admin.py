from django.contrib import admin

from .models import OCRJob


@admin.register(OCRJob)
class OCRJobAdmin(admin.ModelAdmin):
    list_display = ["user", "status", "extracted_ref_no", "confidence", "created_at"]
    list_filter = ["status"]
    search_fields = ["user__email", "extracted_ref_no"]
    readonly_fields = ["celery_task_id", "raw_result"]
