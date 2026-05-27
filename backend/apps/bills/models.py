from django.conf import settings
from django.db import models


class BillRecord(models.Model):
    SOURCE_LESCO = "lesco_fetch"
    SOURCE_OCR = "ocr"
    SOURCE_MANUAL = "manual"
    SOURCE_CHOICES = [
        (SOURCE_LESCO, "LESCO Auto-Fetch"),
        (SOURCE_OCR, "OCR Scan"),
        (SOURCE_MANUAL, "Manual Entry"),
    ]

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="bills"
    )
    month_label = models.CharField(max_length=10, help_text="e.g. 'Aug-25'")
    year = models.IntegerField()
    mon_idx = models.IntegerField(help_text="1–12")
    units = models.IntegerField()
    bill_amount = models.DecimalField(max_digits=10, decimal_places=2)
    payment_amount = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    source = models.CharField(max_length=15, choices=SOURCE_CHOICES, default=SOURCE_MANUAL)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "bill_records"
        unique_together = ("user", "year", "mon_idx")
        ordering = ["year", "mon_idx"]

    def __str__(self):
        return f"{self.user.email} – {self.month_label} ({self.units} units)"


class LescoFetchJob(models.Model):
    STATUS_PENDING = "pending"
    STATUS_RUNNING = "running"
    STATUS_SUCCESS = "success"
    STATUS_FAILED = "failed"
    STATUS_CHOICES = [
        (STATUS_PENDING, "Pending"),
        (STATUS_RUNNING, "Running"),
        (STATUS_SUCCESS, "Success"),
        (STATUS_FAILED, "Failed"),
    ]

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="fetch_jobs"
    )
    ref_no = models.CharField(max_length=20)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default=STATUS_PENDING)
    celery_task_id = models.CharField(max_length=50, blank=True)
    months_fetched = models.IntegerField(default=0)
    error_message = models.TextField(blank=True)
    result_summary = models.JSONField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "lesco_fetch_jobs"
        ordering = ["-created_at"]

    def __str__(self):
        return f"FetchJob #{self.pk} – {self.ref_no} ({self.status})"
