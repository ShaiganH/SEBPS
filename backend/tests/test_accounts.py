"""
Tests for /api/v1/auth/ endpoints:
  - Register
  - Login
  - Me (retrieve + update)
  - Change password
  - Logout
  - billing_cycle_day field end-to-end
"""

import pytest
from django.contrib.auth import get_user_model
from rest_framework import status

User = get_user_model()

REGISTER_URL       = "/api/v1/auth/register/"
LOGIN_URL          = "/api/v1/auth/login/"
ME_URL             = "/api/v1/auth/me/"
CHANGE_PWD_URL     = "/api/v1/auth/change-password/"
LOGOUT_URL         = "/api/v1/auth/logout/"


# ── Register ──────────────────────────────────────────────────────────────────

@pytest.mark.django_db
class TestRegister:
    def _payload(self, **overrides):
        base = {
            "email": "new@sebps.com",
            "username": "newuser",
            "password": "securepass1",
            "password2": "securepass1",
        }
        return {**base, **overrides}

    def test_register_returns_201_with_tokens(self, api_client):
        resp = api_client.post(REGISTER_URL, self._payload())
        assert resp.status_code == status.HTTP_201_CREATED
        assert "access" in resp.data
        assert "refresh" in resp.data
        assert "user" in resp.data

    def test_register_user_profile_in_response(self, api_client):
        resp = api_client.post(REGISTER_URL, self._payload())
        u = resp.data["user"]
        assert u["email"] == "new@sebps.com"
        assert u["username"] == "newuser"

    def test_register_saves_billing_cycle_day(self, api_client):
        resp = api_client.post(REGISTER_URL, self._payload(billing_cycle_day=22))
        assert resp.status_code == status.HTTP_201_CREATED
        db_user = User.objects.get(email="new@sebps.com")
        assert db_user.billing_cycle_day == 22

    def test_register_defaults_billing_cycle_day_to_1(self, api_client):
        resp = api_client.post(REGISTER_URL, self._payload())
        assert resp.status_code == status.HTTP_201_CREATED
        db_user = User.objects.get(email="new@sebps.com")
        assert db_user.billing_cycle_day == 1

    def test_register_password_mismatch_returns_400(self, api_client):
        resp = api_client.post(REGISTER_URL, self._payload(password2="different"))
        assert resp.status_code == status.HTTP_400_BAD_REQUEST

    def test_register_duplicate_email_returns_400(self, api_client, user):
        resp = api_client.post(REGISTER_URL, self._payload(email=user.email))
        assert resp.status_code == status.HTTP_400_BAD_REQUEST

    def test_register_short_password_returns_400(self, api_client):
        resp = api_client.post(REGISTER_URL, self._payload(password="abc", password2="abc"))
        assert resp.status_code == status.HTTP_400_BAD_REQUEST

    def test_register_missing_email_returns_400(self, api_client):
        payload = self._payload()
        del payload["email"]
        resp = api_client.post(REGISTER_URL, payload)
        assert resp.status_code == status.HTTP_400_BAD_REQUEST


# ── Login ─────────────────────────────────────────────────────────────────────

@pytest.mark.django_db
class TestLogin:
    def test_valid_credentials_return_200(self, api_client, user):
        resp = api_client.post(LOGIN_URL, {"email": user.email, "password": "testpass123"})
        assert resp.status_code == status.HTTP_200_OK
        assert "access" in resp.data
        assert "refresh" in resp.data

    def test_login_response_includes_user_profile(self, api_client, user):
        resp = api_client.post(LOGIN_URL, {"email": user.email, "password": "testpass123"})
        assert resp.data["user"]["email"] == user.email
        assert "billing_cycle_day" in resp.data["user"]

    def test_wrong_password_returns_401(self, api_client, user):
        resp = api_client.post(LOGIN_URL, {"email": user.email, "password": "wrongpass"})
        assert resp.status_code == status.HTTP_401_UNAUTHORIZED

    def test_unknown_email_returns_401(self, api_client):
        resp = api_client.post(LOGIN_URL, {"email": "ghost@example.com", "password": "pass"})
        assert resp.status_code == status.HTTP_401_UNAUTHORIZED

    def test_missing_password_returns_400(self, api_client, user):
        resp = api_client.post(LOGIN_URL, {"email": user.email})
        assert resp.status_code == status.HTTP_400_BAD_REQUEST


# ── Me ────────────────────────────────────────────────────────────────────────

@pytest.mark.django_db
class TestMe:
    def test_unauthenticated_returns_401(self, api_client):
        resp = api_client.get(ME_URL)
        assert resp.status_code == status.HTTP_401_UNAUTHORIZED

    def test_returns_user_profile(self, auth_client, user):
        resp = auth_client.get(ME_URL)
        assert resp.status_code == status.HTTP_200_OK
        assert resp.data["email"] == user.email
        assert resp.data["username"] == user.username

    def test_profile_includes_billing_cycle_day(self, auth_client, user):
        resp = auth_client.get(ME_URL)
        assert "billing_cycle_day" in resp.data
        assert resp.data["billing_cycle_day"] == user.billing_cycle_day

    def test_patch_billing_cycle_day(self, auth_client, user):
        resp = auth_client.patch(ME_URL, {"billing_cycle_day": 15})
        assert resp.status_code == status.HTTP_200_OK
        user.refresh_from_db()
        assert user.billing_cycle_day == 15

    def test_patch_phone_number(self, auth_client, user):
        resp = auth_client.patch(ME_URL, {"phone_number": "03001234567"})
        assert resp.status_code == status.HTTP_200_OK
        user.refresh_from_db()
        assert user.phone_number == "03001234567"

    def test_email_is_read_only(self, auth_client, user):
        original_email = user.email
        auth_client.patch(ME_URL, {"email": "hacked@evil.com"})
        user.refresh_from_db()
        assert user.email == original_email


# ── Change password ───────────────────────────────────────────────────────────

@pytest.mark.django_db
class TestChangePassword:
    def test_valid_change_returns_200(self, auth_client, user):
        resp = auth_client.post(CHANGE_PWD_URL, {
            "old_password": "testpass123",
            "new_password": "newpassword99",
            "new_password2": "newpassword99",
        })
        assert resp.status_code == status.HTTP_200_OK
        user.refresh_from_db()
        assert user.check_password("newpassword99")

    def test_wrong_old_password_returns_400(self, auth_client):
        resp = auth_client.post(CHANGE_PWD_URL, {
            "old_password": "wrongold",
            "new_password": "newpassword99",
            "new_password2": "newpassword99",
        })
        assert resp.status_code == status.HTTP_400_BAD_REQUEST

    def test_password_mismatch_returns_400(self, auth_client):
        resp = auth_client.post(CHANGE_PWD_URL, {
            "old_password": "testpass123",
            "new_password": "newpassword99",
            "new_password2": "doesnotmatch",
        })
        assert resp.status_code == status.HTTP_400_BAD_REQUEST


# ── Logout ────────────────────────────────────────────────────────────────────

@pytest.mark.django_db
class TestLogout:
    def test_valid_refresh_token_logs_out(self, api_client, user):
        login_resp = api_client.post(LOGIN_URL, {"email": user.email, "password": "testpass123"})
        # Logout requires an authenticated session — set the access token first
        api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {login_resp.data['access']}")
        resp = api_client.post(LOGOUT_URL, {"refresh": login_resp.data["refresh"]})
        assert resp.status_code == status.HTTP_200_OK

    def test_invalid_token_returns_400(self, auth_client):
        resp = auth_client.post(LOGOUT_URL, {"refresh": "not-a-real-token"})
        assert resp.status_code == status.HTTP_400_BAD_REQUEST

    def test_missing_refresh_key_returns_400(self, auth_client):
        resp = auth_client.post(LOGOUT_URL, {})
        assert resp.status_code == status.HTTP_400_BAD_REQUEST


# ── User model helpers ────────────────────────────────────────────────────────

@pytest.mark.django_db
class TestUserModel:
    def test_bill_kwargs_contains_required_keys(self, user):
        bk = user.bill_kwargs
        for key in ("sanctioned_load_kw", "protected", "fpa_per_unit",
                    "qta_per_unit", "phase", "is_tax_filer"):
            assert key in bk, f"Missing key: {key}"

    def test_bill_kwargs_protected_maps_to_is_protected_consumer(self, user):
        user.is_protected_consumer = True
        assert user.bill_kwargs["protected"] is True

    def test_str_returns_email(self, user):
        assert str(user) == user.email
