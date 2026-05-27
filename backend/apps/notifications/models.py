from django.conf import settings
from django.db import models


class Notification(models.Model):
    TYPE_BUDGET_ALERT = "budget_alert"
    TYPE_FETCH_COMPLETE = "fetch_complete"
    TYPE_PREDICTION_READY = "prediction_ready"
    TYPE_OCR_COMPLETE = "ocr_complete"
    TYPE_SYSTEM = "system"

    TYPE_CHOICES = [
        (TYPE_BUDGET_ALERT, "Budget Alert"),
        (TYPE_FETCH_COMPLETE, "Fetch Complete"),
        (TYPE_PREDICTION_READY, "Prediction Ready"),
        (TYPE_OCR_COMPLETE, "OCR Complete"),
        (TYPE_SYSTEM, "System"),
    ]

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="notifications"
    )
    type = models.CharField(max_length=25, choices=TYPE_CHOICES, default=TYPE_SYSTEM)
    title = models.CharField(max_length=150)
    message = models.TextField()
    is_read = models.BooleanField(default=False)
    data = models.JSONField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "notifications"
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.user.email} – {self.title}"
