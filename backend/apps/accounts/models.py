from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    PHASE_CHOICES = [("single_phase", "Single Phase"), ("three_phase", "Three Phase")]

    email = models.EmailField(unique=True)
    phone_number = models.CharField(max_length=15, blank=True)

    # LESCO-specific fields
    ref_no = models.CharField(
        max_length=20, blank=True,
        help_text="LESCO reference number e.g. '08 11274 1172000U'",
    )
    sanctioned_load_kw = models.FloatField(default=2.0)
    is_protected_consumer = models.BooleanField(
        default=False,
        help_text="Protected consumer (≤5 kW load, typically ≤200 units/month)",
    )
    is_tax_filer = models.BooleanField(default=False)
    phase = models.CharField(max_length=15, choices=PHASE_CHOICES, default="single_phase")

    # FPA/QTA — user-overridable, defaults match current tariff
    fpa_per_unit = models.FloatField(default=-1.597)
    qta_per_unit = models.FloatField(default=-1.769)

    # Billing cycle — day of month the LESCO meter cycle starts (1–28)
    # LESCO issues bills on varying dates; users should enter the day printed
    # on their bill as the "issue date" or the date their units reset each month.
    billing_cycle_day = models.IntegerField(
        default=1,
        help_text="Day of month the billing cycle starts (1–28). Default 1 = standard LESCO cycle.",
    )

    # Push notifications
    push_token = models.CharField(max_length=512, blank=True)

    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = ["username"]

    class Meta:
        db_table = "accounts_user"

    def __str__(self):
        return self.email

    @property
    def bill_kwargs(self) -> dict:
        return {
            "sanctioned_load_kw": self.sanctioned_load_kw,
            "protected": self.is_protected_consumer,
            "fpa_per_unit": self.fpa_per_unit,
            "qta_per_unit": self.qta_per_unit,
            "phase": self.phase,
            "is_tax_filer": self.is_tax_filer,
        }
