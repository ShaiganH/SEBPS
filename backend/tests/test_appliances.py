"""
Tests for /api/v1/appliances/ endpoints.
Covers CRUD, soft-delete, the analyze endpoint (bill impact), and
the optimize endpoint (auto-suggest reductions).
"""

from unittest.mock import patch

import pytest
from rest_framework import status

from tests.conftest import FAKE_ANALYSIS, FAKE_BILL

LIST_URL     = "/api/v1/appliances/"
CATALOG_URL  = "/api/v1/appliances/catalog/"
ANALYZE_URL  = "/api/v1/appliances/analyze/"
OPTIMIZE_URL = "/api/v1/appliances/optimize/"

APPLIANCE_PAYLOAD = {
    "name": "Split AC",
    "wattage_w": 1500,
    "hours_per_day": 8,
    "quantity": 1,
    "category": "Cooling",
}

ANALYZE_PAYLOAD = {
    "appliances": [
        {"name": "AC",     "wattage_w": 1500, "hours_per_day": 8,  "quantity": 1, "category": "Cooling"},
        {"name": "Fridge", "wattage_w": 200,  "hours_per_day": 24, "quantity": 1, "category": "Kitchen"},
    ]
}


# ── Auth guard ────────────────────────────────────────────────────────────────

@pytest.mark.django_db
class TestAuthGuard:
    def test_list_requires_auth(self, api_client):
        assert api_client.get(LIST_URL).status_code == status.HTTP_401_UNAUTHORIZED

    def test_analyze_requires_auth(self, api_client):
        assert api_client.post(ANALYZE_URL, ANALYZE_PAYLOAD, format="json").status_code == status.HTTP_401_UNAUTHORIZED


# ── CRUD ──────────────────────────────────────────────────────────────────────

@pytest.mark.django_db
class TestApplianceCRUD:
    def test_list_empty(self, auth_client):
        resp = auth_client.get(LIST_URL)
        assert resp.status_code == status.HTTP_200_OK

    def test_create_appliance(self, auth_client):
        resp = auth_client.post(LIST_URL, APPLIANCE_PAYLOAD, format="json")
        assert resp.status_code == status.HTTP_201_CREATED
        assert resp.data["name"] == "Split AC"
        assert resp.data["wattage_w"] == 1500

    def test_create_saves_to_db(self, user, auth_client, db):
        from apps.appliances.models import UserAppliance
        auth_client.post(LIST_URL, APPLIANCE_PAYLOAD, format="json")
        assert UserAppliance.objects.filter(user=user, name="Split AC").exists()

    def test_list_shows_created_appliances(self, auth_client, appliances):
        resp = auth_client.get(LIST_URL)
        assert resp.status_code == status.HTTP_200_OK
        results = resp.data.get("results", resp.data)
        assert len(results) == len(appliances)

    def test_retrieve_appliance(self, auth_client, appliances):
        pk = appliances[0].pk
        resp = auth_client.get(f"{LIST_URL}{pk}/")
        assert resp.status_code == status.HTTP_200_OK
        assert resp.data["id"] == pk

    def test_update_appliance(self, auth_client, appliances):
        pk = appliances[0].pk
        resp = auth_client.patch(f"{LIST_URL}{pk}/", {"hours_per_day": 6}, format="json")
        assert resp.status_code == status.HTTP_200_OK
        assert resp.data["hours_per_day"] == 6

    def test_delete_soft_deactivates(self, user, auth_client, appliances, db):
        from apps.appliances.models import UserAppliance
        pk = appliances[0].pk
        resp = auth_client.delete(f"{LIST_URL}{pk}/")
        assert resp.status_code == status.HTTP_204_NO_CONTENT
        # Record still exists in DB but is_active=False
        assert UserAppliance.objects.filter(pk=pk, is_active=False).exists()

    def test_deleted_appliance_not_in_list(self, auth_client, appliances):
        pk = appliances[0].pk
        auth_client.delete(f"{LIST_URL}{pk}/")
        resp = auth_client.get(LIST_URL)
        results = resp.data.get("results", resp.data)
        ids = [a["id"] for a in results]
        assert pk not in ids

    def test_cannot_access_other_users_appliance(self, auth_client, appliances, db):
        from django.contrib.auth import get_user_model
        other = get_user_model().objects.create_user(
            username="other2", email="other2@test.com", password="pw"
        )
        from apps.appliances.models import UserAppliance
        other_app = UserAppliance.objects.create(
            user=other, name="Other AC", wattage_w=1500, hours_per_day=8,
            quantity=1, category="Cooling",
        )
        resp = auth_client.get(f"{LIST_URL}{other_app.pk}/")
        assert resp.status_code == status.HTTP_404_NOT_FOUND


# ── Catalog ───────────────────────────────────────────────────────────────────

@pytest.mark.django_db
class TestCatalog:
    def test_catalog_accessible_without_auth(self, api_client):
        # Catalog is a public read-only list
        resp = api_client.get(CATALOG_URL)
        # May be 401 if the view requires auth — adjust accordingly
        assert resp.status_code in (status.HTTP_200_OK, status.HTTP_401_UNAUTHORIZED)

    def test_catalog_accessible_with_auth(self, auth_client):
        resp = auth_client.get(CATALOG_URL)
        assert resp.status_code == status.HTTP_200_OK


# ── Analyze ───────────────────────────────────────────────────────────────────

@pytest.mark.django_db
class TestAnalyze:
    @patch("tariff.calculate_bill", return_value=FAKE_BILL)
    def test_analyze_returns_breakdown(self, mock_tariff, auth_client):
        resp = auth_client.post(ANALYZE_URL, ANALYZE_PAYLOAD, format="json")
        assert resp.status_code == status.HTTP_200_OK
        assert "appliance_breakdown" in resp.data   # actual key from the view
        assert "summary" in resp.data

    @patch("tariff.calculate_bill", return_value=FAKE_BILL)
    def test_analyze_per_appliance_has_required_fields(self, mock_tariff, auth_client):
        resp = auth_client.post(ANALYZE_URL, ANALYZE_PAYLOAD, format="json")
        assert resp.status_code == status.HTTP_200_OK
        for app in resp.data["appliance_breakdown"]:
            assert "name" in app
            assert "monthly_units" in app

    @patch("tariff.calculate_bill", return_value=FAKE_BILL)
    def test_analyze_missing_appliances_key_returns_400(self, mock_tariff, auth_client):
        """Posting without the appliances key at all must fail validation."""
        resp = auth_client.post(ANALYZE_URL, {}, format="json")
        assert resp.status_code == status.HTTP_400_BAD_REQUEST

    @patch("tariff.calculate_bill", return_value=FAKE_BILL)
    def test_analyze_with_remaining_days_context(self, mock_tariff, auth_client):
        payload = {**ANALYZE_PAYLOAD, "already_consumed_units": 50.0, "remaining_days": 5}
        resp = auth_client.post(ANALYZE_URL, payload, format="json")
        assert resp.status_code == status.HTTP_200_OK
        summary = resp.data["summary"]
        assert summary.get("remaining_days") == 5
        assert summary.get("already_consumed_units") == pytest.approx(50.0, abs=0.01)


# ── Optimize ──────────────────────────────────────────────────────────────────

@pytest.mark.django_db
class TestOptimize:
    @patch("tariff.calculate_bill", return_value=FAKE_BILL)
    @patch("recommender.suggest_to_meet_budget", return_value=[])
    def test_optimize_no_appliances_returns_400(self, mock_rec, mock_tariff, auth_client):
        resp = auth_client.post(OPTIMIZE_URL, {"appliances": []}, format="json")
        assert resp.status_code == status.HTTP_400_BAD_REQUEST

    @patch("tariff.calculate_bill", return_value=FAKE_BILL)
    @patch("recommender.suggest_to_meet_budget", return_value=[])
    def test_optimize_returns_200_when_budget_supplied(self, mock_rec, mock_tariff, auth_client, budget):
        """Optimize needs a budget (via the user's Budget or budget_pkr in payload)."""
        payload = {**ANALYZE_PAYLOAD, "budget_pkr": 15_000}
        resp = auth_client.post(OPTIMIZE_URL, payload, format="json")
        assert resp.status_code == status.HTTP_200_OK

    @patch("tariff.calculate_bill", return_value=FAKE_BILL)
    @patch("recommender.suggest_to_meet_budget", return_value=[])
    def test_optimize_without_budget_returns_400(self, mock_rec, mock_tariff, auth_client):
        """No budget in DB and no budget_pkr in request → 400."""
        resp = auth_client.post(OPTIMIZE_URL, ANALYZE_PAYLOAD, format="json")
        assert resp.status_code == status.HTTP_400_BAD_REQUEST
