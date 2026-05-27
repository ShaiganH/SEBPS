"""
Shared pytest fixtures for the SEBPS backend test suite.
"""

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

User = get_user_model()

# ── Canonical fake return values (used across many test modules) ──────────────

FAKE_BILL = {
    "total_payable": 14_500.0,
    "units": 450,
    "energy_charges": 12_000.0,
    "fixed_charges": 500.0,
    "taxes": 1_500.0,
    "electricity_duty": 400.0,
    "tv_fee": 35.0,
    "meter_rent": 15.0,
    "fc": 50.0,
    "nj_surcharge": 0.0,
}

FAKE_PREDICT = {
    "prediction": {
        "units": 450,
        "bill": {"total_payable": 14_500.0},
    },
    "confidence": {
        "primary_source": "ensemble",
        "confidence_score": 0.87,
    },
    "model_outputs": {"ensemble": 450, "holt_winters": 430, "linear": 460},
    "debug": {},
}

FAKE_ANALYSIS = {
    "appliance_breakdown": [
        {
            "name": "AC",
            "monthly_units": 360.0,
            "share_pct": 80.0,
            "bill_contribution": 11_600.0,
            "bill_drop_per_1hr": 1_450.0,
            "save_per_1hr_units": 45.0,
        },
        {
            "name": "Fridge",
            "monthly_units": 90.0,
            "share_pct": 20.0,
            "bill_contribution": 2_900.0,
            "bill_drop_per_1hr": 0.0,
            "save_per_1hr_units": 0.0,
        },
    ],
    "total_units": 450,
    "total_bill": 14_500.0,
    "within_pkr_budget": False,
    "pkr_gap": 1_500.0,
    "units_gap": 50,
    "units_to_save_for_pkr": 50,
}


# ── Core fixtures ─────────────────────────────────────────────────────────────

@pytest.fixture
def user(db):
    return User.objects.create_user(
        username="testuser",
        email="test@sebps.com",
        password="testpass123",
        billing_cycle_day=1,
        sanctioned_load_kw=2.0,
        is_protected_consumer=False,
        is_tax_filer=False,
        phase="single_phase",
        ref_no="",
    )


@pytest.fixture
def user_with_refno(db):
    return User.objects.create_user(
        username="refuser",
        email="ref@sebps.com",
        password="testpass123",
        billing_cycle_day=22,
        ref_no="08 11274 1172000U",
    )


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def auth_client(user):
    client = APIClient()
    client.force_authenticate(user=user)
    return client


@pytest.fixture
def bill_records(user, db):
    """12 months of BillRecord for `user` — enough for the predictor."""
    from apps.bills.models import BillRecord
    months = [310, 290, 350, 400, 380, 420, 460, 500, 480, 440, 390, 360]
    records = []
    for i, units in enumerate(months, start=1):
        r, _ = BillRecord.objects.update_or_create(
            user=user, year=2025, mon_idx=i,
            defaults={
                "month_label": f"M{i:02d}-25",
                "units": units,
                "bill_amount": units * 32,
            },
        )
        records.append(r)
    return records


@pytest.fixture
def budget(user, db):
    from apps.budget.models import Budget
    return Budget.objects.create(user=user, max_pkr=15_000, max_units=500)


@pytest.fixture
def appliances(user, db):
    from apps.appliances.models import UserAppliance
    return [
        UserAppliance.objects.create(
            user=user, name="AC",
            wattage_w=1_500, hours_per_day=8, quantity=1, category="Cooling",
        ),
        UserAppliance.objects.create(
            user=user, name="Fridge",
            wattage_w=200, hours_per_day=24, quantity=1, category="Kitchen",
        ),
    ]


@pytest.fixture
def iot_device(user, db):
    from apps.iot.models import IoTDevice
    return IoTDevice.objects.create(
        user=user,
        device_id="TEST-DEVICE-001",
        name="Test Smart Meter",
        is_active=True,
    )
