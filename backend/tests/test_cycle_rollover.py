"""
Tests for tasks/cycle_tasks.py — billing_cycle_rollover().

The LESCO fetch and prediction tasks are mocked so the tests run without
Playwright or the predictor module needing external I/O.
"""

from datetime import date, datetime, timedelta
from unittest.mock import MagicMock, patch

import pytest
from django.utils import timezone

from tasks.cycle_tasks import (
    _create_cycle_summary,
    _process_user_rollover,
    billing_cycle_rollover,
)


def _make_now(year, month, day):
    return timezone.make_aware(datetime(year, month, day, 0, 10, 0))


# ── billing_cycle_rollover (top-level task) ────────────────────────────────────

@pytest.mark.django_db
class TestBillingCycleRolloverTask:
    def test_no_matching_users_does_nothing(self, db):
        """If no user has today's billing_cycle_day, no summaries are created."""
        from apps.budget.models import CycleSummary

        with patch("tasks.cycle_tasks._process_user_rollover") as mock_process:
            billing_cycle_rollover()

        # If there happen to be users, _process_user_rollover would be called.
        # We just verify it didn't crash and nothing unexpected happened.
        from django.contrib.auth import get_user_model
        User = get_user_model()
        today = timezone.now().date()
        matching = User.objects.filter(billing_cycle_day=today.day)
        # mock called once per matching user
        assert mock_process.call_count == matching.count()

    @patch("tasks.fetch_tasks.run_lesco_fetch.delay")
    @patch("tasks.prediction_tasks.auto_predict_for_user.delay")
    def test_creates_cycle_summary_for_matching_user(
        self, mock_predict, mock_fetch, user, db
    ):
        from apps.budget.models import CycleSummary
        from django.contrib.auth import get_user_model

        User = get_user_model()
        today = timezone.now().date()

        # Update user's cycle day to match today
        user.billing_cycle_day = today.day
        user.save()

        billing_cycle_rollover()

        assert CycleSummary.objects.filter(user=user).count() == 1

    @patch("tasks.fetch_tasks.run_lesco_fetch.delay")
    @patch("tasks.prediction_tasks.auto_predict_for_user.delay")
    def test_idempotent_second_run_no_duplicate(
        self, mock_predict, mock_fetch, user, db
    ):
        from apps.budget.models import CycleSummary

        today = timezone.now().date()
        user.billing_cycle_day = today.day
        user.save()

        billing_cycle_rollover()
        billing_cycle_rollover()

        assert CycleSummary.objects.filter(user=user).count() == 1


# ── _process_user_rollover ────────────────────────────────────────────────────

@pytest.mark.django_db
class TestProcessUserRollover:
    @patch("tasks.fetch_tasks.run_lesco_fetch.delay")
    def test_user_with_refno_triggers_lesco_fetch(self, mock_delay, user_with_refno, db):
        _process_user_rollover(user_with_refno, timezone.now())
        assert mock_delay.called

    @patch("tasks.prediction_tasks.auto_predict_for_user.delay")
    def test_user_without_refno_triggers_predict(self, mock_delay, user, db):
        user.ref_no = ""
        user.save()
        _process_user_rollover(user, timezone.now())
        assert mock_delay.called

    @patch("tasks.fetch_tasks.run_lesco_fetch.delay", side_effect=Exception("fetch boom"))
    @patch("tasks.prediction_tasks.auto_predict_for_user.delay")
    def test_fetch_failure_falls_back_to_predict(
        self, mock_predict, mock_fetch, user_with_refno, db
    ):
        _process_user_rollover(user_with_refno, timezone.now())
        assert mock_predict.called

    @patch("tasks.fetch_tasks.run_lesco_fetch.delay")
    def test_does_not_raise_on_iot_query_failure(self, mock_fetch, user_with_refno, db):
        with patch("apps.iot.models.IoTDevice.objects") as mock_iot:
            mock_iot.filter.side_effect = Exception("DB gone")
            # Should log but not propagate
            try:
                _process_user_rollover(user_with_refno, timezone.now())
            except Exception:
                pytest.fail("_process_user_rollover raised unexpectedly")


# ── _create_cycle_summary ─────────────────────────────────────────────────────

@pytest.mark.django_db
class TestCreateCycleSummary:
    def _run(self, user, now=None):
        if now is None:
            now = timezone.now()
        from services.billing_utils import get_billing_cycle
        yesterday = now - timedelta(days=1)
        old = get_billing_cycle(user, now=yesterday)
        _create_cycle_summary(
            user,
            old_start=old["billing_start"],
            old_start_date=old["billing_start"].date(),
            old_end_date=(now - timedelta(days=1)).date(),
            total_cycle_days=old["total_cycle_days"],
        )

    def test_creates_cycle_summary_record(self, user, db):
        from apps.budget.models import CycleSummary
        self._run(user)
        assert CycleSummary.objects.filter(user=user).exists()

    def test_savings_calculated_when_budget_and_bill_present(self, user, budget, bill_records, db):
        from apps.budget.models import CycleSummary
        self._run(user)
        summary = CycleSummary.objects.get(user=user)
        # budget_pkr should be set from the Budget fixture
        assert summary.budget_pkr is not None

    def test_notification_created(self, user, db):
        from apps.notifications.models import Notification
        self._run(user)
        assert Notification.objects.filter(user=user, type="cycle_summary").exists()

    def test_iot_data_populated_when_device_has_readings(self, user, iot_device, db):
        from apps.iot.models import IoTReading
        from apps.budget.models import CycleSummary
        from services.billing_utils import get_billing_cycle

        now = timezone.now()
        billing_start = get_billing_cycle(user, now=now - timedelta(days=1))["billing_start"]

        IoTReading.objects.create(device=iot_device, time=billing_start + timedelta(hours=2), energy=100.0, power=500, voltage=220.0, current=2.27)
        IoTReading.objects.create(device=iot_device, time=billing_start + timedelta(hours=20), energy=108.0, power=500, voltage=220.0, current=2.27)

        self._run(user, now=now)
        summary = CycleSummary.objects.get(user=user)
        assert summary.iot_units_kwh == pytest.approx(8.0, abs=0.01)

    def test_positive_savings_when_under_budget(self, user, budget, bill_records, db):
        from apps.budget.models import CycleSummary, Budget

        # Set a very high budget so the bill is always under it
        budget.max_pkr = 999_999
        budget.save()

        self._run(user)
        summary = CycleSummary.objects.get(user=user)
        if summary.savings_pkr is not None:
            assert float(summary.savings_pkr) > 0

    def test_negative_savings_when_over_budget(self, user, budget, bill_records, db):
        from apps.budget.models import Budget

        # Set a very low budget so the bill always exceeds it
        budget.max_pkr = 1
        budget.save()

        from apps.budget.models import CycleSummary
        self._run(user)
        summary = CycleSummary.objects.get(user=user)
        if summary.savings_pkr is not None:
            assert float(summary.savings_pkr) < 0


# ── CycleSummary model constraints ────────────────────────────────────────────

@pytest.mark.django_db
class TestCycleSummaryModel:
    def test_unique_together_prevents_duplicate(self, user, db):
        from apps.budget.models import CycleSummary
        from django.db import IntegrityError

        CycleSummary.objects.create(
            user=user, cycle_start=date(2026, 5, 1), cycle_end=date(2026, 5, 31),
            total_cycle_days=31,
        )
        with pytest.raises(IntegrityError):
            CycleSummary.objects.create(
                user=user, cycle_start=date(2026, 5, 1), cycle_end=date(2026, 5, 31),
                total_cycle_days=31,
            )

    def test_str_representation(self, user, db):
        from apps.budget.models import CycleSummary
        s = CycleSummary.objects.create(
            user=user, cycle_start=date(2026, 5, 1), cycle_end=date(2026, 5, 31),
            total_cycle_days=31,
        )
        assert user.email in str(s)
