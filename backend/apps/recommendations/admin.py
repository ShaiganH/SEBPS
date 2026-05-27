from django.contrib import admin

from .models import Recommendation, ReductionPlan


@admin.register(Recommendation)
class RecommendationAdmin(admin.ModelAdmin):
    list_display = ["user", "predicted_units", "predicted_bill_pkr", "within_budget", "applied", "created_at"]
    list_filter = ["within_budget", "applied"]
    search_fields = ["user__email"]
    readonly_fields = ["analysis"]


@admin.register(ReductionPlan)
class ReductionPlanAdmin(admin.ModelAdmin):
    list_display = ["recommendation", "appliance_name", "hours_reduced", "units_saved", "slab_crossed"]
