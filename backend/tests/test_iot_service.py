"""
Tests for services/iot_service.py — get_iot_consumption().

Verifies that the billing-cycle window (not a fixed 30-day window) is used,
and that Max−Min energy delta is computed correctly.
"""

from datetime import datetime, timedelta

import pytest
from django.utils import timezone

from services.iot_service import get_iot_consumption


def _dt(year, month, day, hour=12):
    return timezone.make_aware(datetime(year, month, day, hour, 0, 0))


@pytest.mark.django_db
class TestGetIotConsumption:
    def test_no_devices_returns_no_data(self, user):
        result = get_iot_consumption(user)
        assert result["has_data"] is False
        assert result["units_kwh"] == 0.0
        assert result["cost_pkr"] == 0.0
        assert result["device_count"] == 0

    def test_inactive_device_ignored(self, user, db):
        from apps.iot.models import IoTDevice
        IoTDevice.objects.create(
            user=user, device_id="INACTIVE-01", name="Off", is_active=False
        )
        result = get_iot_consumption(user)
        assert result["has_data"] is False

    def test_device_with_no_readings_returns_no_data(self, user, iot_device):
        result = get_iot_consumption(user)
        assert result["has_data"] is False

    def test_readings_within_billing_cycle_counted(self, user, iot_device, db):
        from apps.iot.models import IoTReading
        from services.billing_utils import get_billing_cycle

        now = timezone.now()
        cycle = get_billing_cycle(user, now=now)
        billing_start = cycle["billing_start"]

        # Two readings inside the billing cycle
        IoTReading.objects.create(device=iot_device, time=billing_start + timedelta(hours=1), energy=100.0, power=500, voltage=220.0, current=2.27)
        IoTReading.objects.create(device=iot_device, time=billing_start + timedelta(hours=5), energy=105.5, power=500, voltage=220.0, current=2.27)

        result = get_iot_consumption(user)
        assert result["has_data"] is True
        assert abs(result["units_kwh"] - 5.5) < 0.01  # Max − Min = 105.5 − 100.0

    def test_readings_before_billing_start_excluded(self, user, iot_device, db):
        from apps.iot.models import IoTReading
        from services.billing_utils import get_billing_cycle

        now = timezone.now()
        cycle = get_billing_cycle(user, now=now)
        billing_start = cycle["billing_start"]

        # One reading BEFORE the billing cycle — should be excluded
        IoTReading.objects.create(device=iot_device, time=billing_start - timedelta(days=5), energy=50.0, power=500, voltage=220.0, current=0.23)
        # One reading INSIDE the billing cycle
        IoTReading.objects.create(device=iot_device, time=billing_start + timedelta(hours=2), energy=55.0, power=500, voltage=220.0, current=0.23)

        result = get_iot_consumption(user)
        # Only the single reading inside the cycle exists → Max = Min = 55.0 → delta = 0
        assert result["has_data"] is False or result["units_kwh"] == pytest.approx(0.0, abs=0.01)

    def test_cost_pkr_is_positive_for_nonzero_consumption(self, user, iot_device, db):
        from apps.iot.models import IoTReading
        from services.billing_utils import get_billing_cycle

        cycle = get_billing_cycle(user)
        billing_start = cycle["billing_start"]

        IoTReading.objects.create(device=iot_device, time=billing_start + timedelta(hours=1), energy=200.0, power=1000, voltage=220.0, current=4.55)
        IoTReading.objects.create(device=iot_device, time=billing_start + timedelta(hours=25), energy=225.0, power=1000, voltage=220.0, current=4.55)

        result = get_iot_consumption(user)
        assert result["has_data"] is True
        assert result["cost_pkr"] > 0

    def test_user_billing_cycle_day_determines_window(self, db):
        """A user with billing_cycle_day=22 only sees readings from the 22nd onward."""
        from apps.iot.models import IoTDevice, IoTReading

        user = __import__("django.contrib.auth", fromlist=["get_user_model"]).get_user_model()
        User = user
        u = User.objects.create_user(
            username="cyc22", email="cyc22@test.com",
            password="pw", billing_cycle_day=22,
        )
        device = IoTDevice.objects.create(user=u, device_id="CYC22-DEV", name="Dev", is_active=True)

        from services.billing_utils import get_billing_cycle
        cycle = get_billing_cycle(u)
        billing_start = cycle["billing_start"]

        # Reading just before the cycle start → must be ignored
        IoTReading.objects.create(device=device, time=billing_start - timedelta(hours=1), energy=10.0, power=100, voltage=220.0, current=0.45)
        # Two readings inside the cycle
        IoTReading.objects.create(device=device, time=billing_start + timedelta(hours=2), energy=10.0, power=100, voltage=220.0, current=0.45)
        IoTReading.objects.create(device=device, time=billing_start + timedelta(hours=10), energy=11.0, power=100, voltage=220.0, current=0.45)

        result = get_iot_consumption(u)
        assert result["has_data"] is True
        assert result["units_kwh"] == pytest.approx(1.0, abs=0.01)
