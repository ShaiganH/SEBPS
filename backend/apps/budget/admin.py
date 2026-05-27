from django.contrib import admin

from .models import Budget, BudgetAlert


@admin.register(Budget)
class BudgetAdmin(admin.ModelAdmin):
    list_display = ["user", "max_pkr", "max_units", "is_active", "updated_at"]


@admin.register(BudgetAlert)
class BudgetAlertAdmin(admin.ModelAdmin):
    list_display = ["budget", "threshold_pct", "consumed_pkr", "triggered_at"]
    list_filter = ["threshold_pct"]
