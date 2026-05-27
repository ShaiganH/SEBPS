"""
Tests for /api/v1/predictions/ endpoints and _get_iot_context().
"""

from datetime import datetime, timedelta
from unittest.mock import patch

import pytest
from django.utils import timezone
from rest_framework import status

from tests.conftest import FAKE_PREDICT

GENERATE_URL = "/api/v1/predictions/generate/"
LIST_URL     = "/api/v1/predictions/"
LATEST_URL   = "/api/v1/predictions/latest/"
CONTEXT_URL  = "/api/v1/predictions/iot-status/"


# ── _get_iot_context ──────────────────────────────────────────────────────────

@pytest.mark.django_db
class TestIotContext:
    def test_no_device_returns_has_iot_false(self, user):
        from apps.predictions.views import _get_iot_context
        ctx = _get_iot_context(user)
        assert ctx["has_iot"] is False
        assert ctx["measured_kwh"] == 0.0
        assert ctx["units_so_far"] == 0.0

    def test_no_device_days_elapsed_and_total_cycle_days_set(self, user):
        from apps.predictions.views import _get_iot_context
        ctx = _get_iot_context(user)
        assert ctx["days_elapsed"] >= 1
        assert ctx["total_cycle_days"] in range(28, 32)

    def test_no_device_billing_start_uses_user_cycle_day(self, user):
        from apps.predictions.views import _get_iot_context
        from services.billing_utils import get_billing_cycle
        ctx = _get_iot_context(user)
        expected_start = get_billing_cycle(user)["billing_start"].date()
        assert ctx["billing_start"].date() == expected_start

    def test_device_no_readings_has_iot_false(self, user, iot_device):
        from apps.predictions.views import _get_iot_context
        ctx = _get_iot_context(user)
        assert ctx["has_iot"] is False

    def test_device_with_readings_has_iot_true(self, user, iot_device, db):
        from apps.iot.models import IoTReading
        from apps.predictions.views import _get_iot_context
        from services.billing_utils import get_billing_cycle

        billing_start = get_billing_cycle(user)["billing_start"]
        IoTReading.objects.create(device=iot_device, time=billing_start + timedelta(hours=1), energy=100.0, power=500, voltage=220.0, current=2.27)
        IoTReading.objects.create(device=iot_device, time=billing_start + timedelta(hours=5), energy=108.0, power=500, voltage=220.0, current=2.27)

        ctx = _get_iot_context(user)
        assert ctx["has_iot"] is True
        assert ctx["measured_kwh"] == pytest.approx(8.0, abs=0.01)

    def test_context_api_endpoint_returns_200(self, auth_client):
        resp = auth_client.get(CONTEXT_URL)
        assert resp.status_code == status.HTTP_200_OK
        assert "has_iot" in resp.data
        assert "days_elapsed" in resp.data
        assert "billing_start" in resp.data


# ── Generate prediction ───────────────────────────────────────────────────────

@pytest.mark.django_db
class TestGeneratePrediction:
    def test_no_bills_returns_400(self, auth_client):
        resp = auth_client.post(GENERATE_URL, {})
        assert resp.status_code == status.HTTP_400_BAD_REQUEST
        assert "detail" in resp.data

    def test_one_bill_returns_400(self, user, auth_client, db):
        from apps.bills.models import BillRecord
        BillRecord.objects.create(
            user=user, year=2025, mon_idx=1,
            month_label="Jan-25", units=300, bill_amount=9600,
        )
        resp = auth_client.post(GENERATE_URL, {})
        assert resp.status_code == status.HTTP_400_BAD_REQUEST

    @patch("predictor.predict", return_value=FAKE_PREDICT)
    def test_sufficient_bills_returns_201(self, mock_predict, auth_client, bill_records):
        resp = auth_client.post(GENERATE_URL, {})
        assert resp.status_code == status.HTTP_201_CREATED
        assert "predicted_units" in resp.data
        assert "predicted_bill" in resp.data

    @patch("predictor.predict", return_value=FAKE_PREDICT)
    def test_prediction_saved_to_db(self, mock_predict, user, auth_client, bill_records, db):
        from apps.predictions.models import Prediction
        auth_client.post(GENERATE_URL, {})
        assert Prediction.objects.filter(user=user).exists()

    def test_unauthenticated_returns_401(self, api_client):
        resp = api_client.post(GENERATE_URL, {})
        assert resp.status_code == status.HTTP_401_UNAUTHORIZED


# ── List / Latest ─────────────────────────────────────────────────────────────

@pytest.mark.django_db
class TestPredictionListLatest:
    def test_empty_list(self, auth_client):
        resp = auth_client.get(LIST_URL)
        assert resp.status_code == status.HTTP_200_OK

    def test_latest_no_prediction_returns_404(self, auth_client):
        resp = auth_client.get(LATEST_URL)
        assert resp.status_code == status.HTTP_404_NOT_FOUND

    @patch("predictor.predict", return_value=FAKE_PREDICT)
    def test_latest_returns_most_recent(self, mock_pred, user, auth_client, bill_records, db):
        from apps.predictions.models import Prediction
        # Create two predictions; latest should be the second
        Prediction.objects.create(
            user=user, units_so_far=100, days_elapsed=5, total_cycle_days=31,
            fpa_per_unit=-1.597, qta_per_unit=-1.769, sanctioned_load_kw=2.0,
            is_protected=False, is_tax_filer=False, phase="single_phase",
            result=FAKE_PREDICT, predicted_units=400, predicted_bill=12000,
        )
        Prediction.objects.create(
            user=user, units_so_far=200, days_elapsed=10, total_cycle_days=31,
            fpa_per_unit=-1.597, qta_per_unit=-1.769, sanctioned_load_kw=2.0,
            is_protected=False, is_tax_filer=False, phase="single_phase",
            result=FAKE_PREDICT, predicted_units=450, predicted_bill=14500,
        )
        resp = auth_client.get(LATEST_URL)
        assert resp.status_code == status.HTTP_200_OK
        # Model ordering is -created_at, so first() = most recent = 450 units
        assert resp.data["predicted_units"] == 450

    def test_list_only_shows_own_predictions(self, user, auth_client, db):
        """A second user's predictions must not appear in user's list."""
        from apps.predictions.models import Prediction
        other_user = __import__("django.contrib.auth", fromlist=["get_user_model"]).get_user_model().objects.create_user(
            username="other", email="other@test.com", password="pw"
        )
        Prediction.objects.create(
            user=other_user, units_so_far=100, days_elapsed=5, total_cycle_days=31,
            fpa_per_unit=-1.597, qta_per_unit=-1.769, sanctioned_load_kw=2.0,
            is_protected=False, is_tax_filer=False, phase="single_phase",
            result=FAKE_PREDICT, predicted_units=400, predicted_bill=12000,
        )
        resp = auth_client.get(LIST_URL)
        assert resp.status_code == status.HTTP_200_OK
        results = resp.data.get("results", resp.data)
        assert len(results) == 0
