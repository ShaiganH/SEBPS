from django.contrib import admin
from django.contrib.auth.admin import UserAdmin

from .models import User


@admin.register(User)
class CustomUserAdmin(UserAdmin):
    list_display = ["email", "username", "ref_no", "phase", "is_protected_consumer", "is_staff"]
    list_filter = ["is_staff", "is_active", "phase", "is_protected_consumer", "is_tax_filer"]
    search_fields = ["email", "username", "ref_no", "phone_number"]
    fieldsets = UserAdmin.fieldsets + (
        (
            "LESCO Profile",
            {
                "fields": (
                    "phone_number", "ref_no", "sanctioned_load_kw",
                    "is_protected_consumer", "is_tax_filer", "phase",
                    "fpa_per_unit", "qta_per_unit", "push_token",
                )
            },
        ),
    )
