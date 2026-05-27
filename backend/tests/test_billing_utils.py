"""
Unit tests for services/billing_utils.py — get_billing_cycle().

All tests are pure date arithmetic; no database is needed.
"""

from datetime import date, datetime

import pytest
from django.utils import timezone

from services.billing_utils import get_billing_cycle


class FakeUser:
    """Minimal user stand-in — only billing_cycle_day is needed."""
    def __init__(self, day=1):
        self.billing_cycle_day = day


def _now(year, month, day, hour=12):
    """Return a timezone-aware datetime at noon on the given date (PKT)."""
    return timezone.make_aware(datetime(year, month, day, hour, 0, 0))


# ── billing_start correctness ─────────────────────────────────────────────────

class TestBillingStart:
    def test_d1_start_is_first_of_current_month(self):
        cycle = get_billing_cycle(FakeUser(1), now=_now(2026, 5, 26))
        assert cycle["billing_start"].date() == date(2026, 5, 1)

    def test_d22_today_after_d_same_month(self):
        cycle = get_billing_cycle(FakeUser(22), now=_now(2026, 5, 26))
        assert cycle["billing_start"].date() == date(2026, 5, 22)

    def test_d22_today_before_d_previous_month(self):
        cycle = get_billing_cycle(FakeUser(22), now=_now(2026, 5, 15))
        assert cycle["billing_start"].date() == date(2026, 4, 22)

    def test_d22_today_exactly_on_d(self):
        """On the cycle start day itself, cycle started today."""
        cycle = get_billing_cycle(FakeUser(22), now=_now(2026, 5, 22))
        assert cycle["billing_start"].date() == date(2026, 5, 22)

    def test_year_boundary_jan_before_d(self):
        """Jan 10 with D=15 → cycle started Dec 15 of previous year."""
        cycle = get_billing_cycle(FakeUser(15), now=_now(2026, 1, 10))
        assert cycle["billing_start"].date() == date(2025, 12, 15)

    def test_billing_start_is_midnight(self):
        cycle = get_billing_cycle(FakeUser(22), now=_now(2026, 5, 26))
        bs = cycle["billing_start"]
        assert bs.hour == 0 and bs.minute == 0 and bs.second == 0

    def test_billing_start_is_timezone_aware(self):
        cycle = get_billing_cycle(FakeUser(1), now=_now(2026, 5, 26))
        assert cycle["billing_start"].tzinfo is not None


# ── days_elapsed ──────────────────────────────────────────────────────────────

class TestDaysElapsed:
    def test_d1_may26_elapsed_is_26(self):
        cycle = get_billing_cycle(FakeUser(1), now=_now(2026, 5, 26))
        assert cycle["days_elapsed"] == 26

    def test_d22_may26_elapsed_is_5(self):
        # May22=1, May23=2, May24=3, May25=4, May26=5
        cycle = get_billing_cycle(FakeUser(22), now=_now(2026, 5, 26))
        assert cycle["days_elapsed"] == 5

    def test_d22_may15_elapsed_is_24(self):
        # Apr22=1 ... May15=24
        cycle = get_billing_cycle(FakeUser(22), now=_now(2026, 5, 15))
        assert cycle["days_elapsed"] == 24

    def test_elapsed_is_1_on_start_day(self):
        cycle = get_billing_cycle(FakeUser(22), now=_now(2026, 5, 22))
        assert cycle["days_elapsed"] == 1


# ── total_cycle_days ──────────────────────────────────────────────────────────

class TestTotalCycleDays:
    def test_d1_may_is_31_days(self):
        cycle = get_billing_cycle(FakeUser(1), now=_now(2026, 5, 26))
        assert cycle["total_cycle_days"] == 31

    def test_d22_may22_to_jun22_is_31_days(self):
        cycle = get_billing_cycle(FakeUser(22), now=_now(2026, 5, 26))
        assert cycle["total_cycle_days"] == 31

    def test_d22_apr22_to_may22_is_30_days(self):
        cycle = get_billing_cycle(FakeUser(22), now=_now(2026, 5, 15))
        assert cycle["total_cycle_days"] == 30

    def test_feb_cycle_28_days(self):
        """Feb 1 – Mar 1 = 28 days in a non-leap year."""
        cycle = get_billing_cycle(FakeUser(1), now=_now(2026, 2, 15))
        assert cycle["total_cycle_days"] == 28

    def test_year_boundary_dec15_to_jan15(self):
        """Dec 15, 2025 – Jan 15, 2026 = 31 days."""
        cycle = get_billing_cycle(FakeUser(15), now=_now(2026, 1, 10))
        assert cycle["total_cycle_days"] == 31


# ── remaining_days ────────────────────────────────────────────────────────────

class TestRemainingDays:
    def test_remaining_equals_total_minus_elapsed(self):
        for day_of_month in (1, 5, 22):
            user = FakeUser(day_of_month)
            cycle = get_billing_cycle(user, now=_now(2026, 5, 26))
            assert cycle["remaining_days"] == cycle["total_cycle_days"] - cycle["days_elapsed"]

    def test_remaining_never_negative(self):
        # On the last day of the cycle remaining should be 0 (not -1)
        # D=1, May 31 → elapsed=31, total=31, remaining=0
        cycle = get_billing_cycle(FakeUser(1), now=_now(2026, 5, 31))
        assert cycle["remaining_days"] == 0

    def test_d1_may26_remaining_is_5(self):
        cycle = get_billing_cycle(FakeUser(1), now=_now(2026, 5, 26))
        assert cycle["remaining_days"] == 5


# ── clamping / robustness ─────────────────────────────────────────────────────

class TestClamping:
    def test_day_zero_clamped_to_1(self):
        cycle = get_billing_cycle(FakeUser(0), now=_now(2026, 5, 26))
        assert cycle["billing_start"].day == 1

    def test_day_29_clamped_to_28(self):
        cycle = get_billing_cycle(FakeUser(29), now=_now(2026, 5, 26))
        assert cycle["billing_start"].day == 28

    def test_none_billing_cycle_day_defaults_to_1(self):
        """Users created before the field existed have billing_cycle_day=None."""
        user = FakeUser(None)
        cycle = get_billing_cycle(user, now=_now(2026, 5, 26))
        assert cycle["billing_start"].day == 1

    def test_no_now_arg_uses_current_time(self):
        """Calling without `now` must not crash."""
        cycle = get_billing_cycle(FakeUser(1))
        assert "billing_start" in cycle
        assert cycle["days_elapsed"] >= 1
