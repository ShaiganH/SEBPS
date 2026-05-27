from django.contrib import admin

from .models import ApplianceCatalog, UserAppliance


@admin.register(ApplianceCatalog)
class ApplianceCatalogAdmin(admin.ModelAdmin):
    list_display = ["name", "category", "wattage_w", "typical_hours_per_day"]
    list_filter = ["category"]
    search_fields = ["name"]


@admin.register(UserAppliance)
class UserApplianceAdmin(admin.ModelAdmin):
    list_display = ["user", "name", "wattage_w", "hours_per_day", "quantity", "is_active"]
    list_filter = ["category", "is_active"]
    search_fields = ["user__email", "name"]
