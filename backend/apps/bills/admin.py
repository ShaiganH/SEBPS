from django.contrib import admin

from .models import BillRecord, LescoFetchJob


@admin.register(BillRecord)
class BillRecordAdmin(admin.ModelAdmin):
    list_display = ["user", "month_label", "units", "bill_amount", "source", "created_at"]
    list_filter = ["source", "year"]
    search_fields = ["user__email", "month_label"]
    ordering = ["-year", "-mon_idx"]


@admin.register(LescoFetchJob)
class LescoFetchJobAdmin(admin.ModelAdmin):
    list_display = ["user", "ref_no", "status", "months_fetched", "created_at"]
    list_filter = ["status"]
    search_fields = ["user__email", "ref_no"]
    readonly_fields = ["celery_task_id", "result_summary"]
