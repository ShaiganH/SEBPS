"""
Tests for /api/v1/budget/ endpoint.
Covers creation, retrieval, IoT-based vs prediction-based consumption display,
and budget alerts list.
"""

from unittest.mock import patch

import pytest
from rest_framework import status

from tests.conftest import FAKE_PREDICT

BUDGET_URL  = "/api/v1/budget/"
ALERTS_URL  = "/api/v1/budget/alerts/"
HISTORY_URL = "/api/v1/budget/history/"

NO_IOT = {"has_data": False, "units_kwh": 0.0, "cost_pkr": 0.0, "device_count": 0}
WITH_IOT = {"has_data": True, "units_kwh": 120.5, "cost_pkr": 3_900.0, "device_count": 1}


# ── GET /budget/ ──────────────────────────────────────────────────────────────

@pytest.mark.django_db
class TestGetBudget:
    def test_unauthenticated_returns_401(self, api_client):
        resp = api_client.get(BUDGET_URL)
        assert resp.status_code == status.HTTP_401_UNAUTHORIZED

    def test_no_budget_returns_404(self, auth_client):
        resp = auth_client.get(BUDGET_URL)
        assert resp.status_code == status.HTTP_404_NOT_FOUND

    @patch("services.iot_service.get_iot_consumption", return_value=NO_IOT)
    def test_budget_without_iot_or_prediction(self, mock_iot, auth_client, budget):
        resp = auth_client.get(BUDGET_URL)
        assert resp.status_code == status.HTTP_200_OK
        assert float(resp.data["max_pkr"]) == 15_000.0

    @patch("services.iot_service.get_iot_consumption", return_value=WITH_IOT)
    def test_iot_data_drives_budget_used_pct(self, mock_iot, auth_client, budget):
        resp = auth_client.get(BUDGET_URL)
        assert resp.status_code == status.HTTP_200_OK
        # 3900 / 15000 * 100 = 26%
        assert resp.data["budget_used_pct"] == pytest.approx(26.0, abs=0.5)
        assert resp.data["consumption_source"] == "iot"

    @patch("services.iot_service.get_iot_consumption", return_value=WITH_IOT)
    def test_iot_units_kwh_in_response(self, mock_iot, auth_client, budget):
        resp = auth_client.get(BUDGET_URL)
        assert "iot_units_kwh" in resp.data
        assert resp.data["iot_units_kwh"] == pytest.approx(120.5, abs=0.01)


# ── POST /budget/ ─────────────────────────────────────────────────────────────

@pytest.mark.django_db
class TestCreateUpdateBudget:
    @patch("services.iot_service.get_iot_consumption", return_value=NO_IOT)
    @patch("tasks.prediction_tasks.smart_recommendation_for_user.delay")
    def test_create_budget_returns_200(self, mock_task, mock_iot, auth_client):
        resp = auth_client.post(BUDGET_URL, {"max_pkr": "20000", "max_units": 600})
        assert resp.status_code == status.HTTP_200_OK
        assert float(resp.data["max_pkr"]) == 20_000.0

    @patch("services.iot_service.get_iot_consumption", return_value=NO_IOT)
    @patch("tasks.prediction_tasks.smart_recommendation_for_user.delay")
    def test_create_is_upsert(self, mock_task, mock_iot, auth_client, budget):
        """POSTing again updates the existing budget, not create a second one."""
        from apps.budget.models import Budget
        from django.contrib.auth import get_user_model

        auth_client.post(BUDGET_URL, {"max_pkr": "25000"})
        count = Budget.objects.filter(user__email="test@sebps.com").count()
        assert count == 1

    @patch("services.iot_service.get_iot_consumption", return_value=NO_IOT)
    @patch("tasks.prediction_tasks.smart_recommendation_for_user.delay")
    def test_triggers_smart_rec_when_prediction_exists(
        self, mock_task, mock_iot, user, auth_client, db
    ):
        from apps.predictions.models import Prediction
        Prediction.objects.create(
            user=user, units_so_far=200, days_elapsed=10, total_cycle_days=31,
            fpa_per_unit=-1.597, qta_per_unit=-1.769, sanctioned_load_kw=2.0,
            is_protected=False, is_tax_filer=False, phase="single_phase",
            result=FAKE_PREDICT, predicted_units=450, predicted_bill=14_500,
        )
        auth_client.post(BUDGET_URL, {"max_pkr": "18000"})
        assert mock_task.called


# ── GET /budget/alerts/ ───────────────────────────────────────────────────────

@pytest.mark.django_db
class TestBudgetAlerts:
    def test_no_budget_returns_empty_list(self, auth_client):
        resp = auth_client.get(ALERTS_URL)
        assert resp.status_code == status.HTTP_200_OK
        assert resp.data == []

    def test_alerts_list_with_existing_alert(self, user, auth_client, budget, db):
        from apps.budget.models import BudgetAlert
        BudgetAlert.objects.create(
            budget=budget, threshold_pct=75,
            consumed_units=375, consumed_pkr=11_250,
        )
        resp = auth_client.get(ALERTS_URL)
        assert resp.status_code == status.HTTP_200_OK
        assert len(resp.data) == 1
        assert resp.data[0]["threshold_pct"] == 75


# ── GET /budget/history/ ──────────────────────────────────────────────────────

@pytest.mark.django_db
class TestBudgetHistory:
    def test_empty_history(self, auth_client):
        resp = auth_client.get(HISTORY_URL)
        assert resp.status_code == status.HTTP_200_OK
        assert resp.data == []

    def test_history_with_bills(self, auth_client, bill_records, budget):
        resp = auth_client.get(HISTORY_URL)
        assert resp.status_code == status.HTTP_200_OK
        assert len(resp.data) == len(bill_records)
        first = resp.data[0]
        assert "units" in first
        assert "bill_pkr" in first
        assert "budget_pkr" in first
        assert "over_budget" in first

    def test_history_without_budget_omits_budget_fields(self, auth_client, bill_records):
        resp = auth_client.get(HISTORY_URL)
        assert resp.status_code == status.HTTP_200_OK
        # No budget → no budget_pkr key
        assert "budget_pkr" not in resp.data[0]
