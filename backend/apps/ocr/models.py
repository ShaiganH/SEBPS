from django.conf import settings
from django.db import models


class OCRJob(models.Model):
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
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="ocr_jobs"
    )
    image = models.ImageField(upload_to="ocr_uploads/%Y/%m/")
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default=STATUS_PENDING)
    celery_task_id = models.CharField(max_length=50, blank=True)

    # Results
    extracted_ref_no = models.CharField(max_length=25, blank=True)
    confidence = models.FloatField(null=True, blank=True)
    method = models.CharField(max_length=50, blank=True)
    variants_run = models.IntegerField(default=0)
    raw_result = models.JSONField(null=True, blank=True)
    error_message = models.TextField(blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "ocr_jobs"
        ordering = ["-created_at"]

    def __str__(self):
        return f"OCRJob #{self.pk} – {self.status} – {self.extracted_ref_no or 'no ref'}"
