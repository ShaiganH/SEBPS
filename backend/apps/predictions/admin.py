from django.contrib import admin

from .models import Prediction


@admin.register(Prediction)
class PredictionAdmin(admin.ModelAdmin):
    list_display = [
        "user", "predicted_units", "predicted_bill",
        "primary_source", "days_elapsed", "created_at",
    ]
    list_filter = ["primary_source", "phase"]
    search_fields = ["user__email"]
    readonly_fields = ["result"]
