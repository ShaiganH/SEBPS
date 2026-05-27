"""
Billing-cycle utility for SEBPS.

LESCO customers can have a billing cycle that starts on any day of the month
(1–28).  This module centralises all cycle-boundary arithmetic so no view or
task ever hard-codes ``day=1``.

Usage
-----
    from services.billing_utils import get_billing_cycle

    cycle = get_billing_cycle(user)          # uses Django's timezone.now()
    cycle = get_billing_cycle(user, now=dt)  # pass an explicit aware datetime

    cycle["billing_start"]    # timezone-aware midnight on start of current cycle
    cycle["days_elapsed"]     # 1 on the start day, 2 on day after, …
    cycle["total_cycle_days"] # e.g. 31 for a May-22 → Jun-22 cycle
    cycle["remaining_days"]   # total_cycle_days - days_elapsed (min 0)
"""

import calendar
from datetime import datetime

from django.utils import timezone


def get_billing_cycle(user, now=None):
    """
    Return billing-cycle context for *user*.

    The user's ``billing_cycle_day`` (D, 1–28) defines the calendar day on
    which LESCO resets their meter / issues a new bill.

    Cycle logic
    -----------
    * If ``today.day >= D``  → cycle started on **this month's D**.
    * If ``today.day <  D``  → cycle started on **last month's D**.

    Returns
    -------
    dict with keys:

    billing_start    – timezone-aware datetime, midnight of cycle start day
    days_elapsed     – int, 1-indexed (1 = cycle start day itself)
    total_cycle_days – int, e.g. 31 for a May-22 → Jun-22 span
    remaining_days   – int = max(0, total_cycle_days - days_elapsed)
    """
    if now is None:
        now = timezone.now()

    # Clamp D to a safe range (Feb always has ≥ 28 days)
    D = int(getattr(user, "billing_cycle_day", 1) or 1)
    D = min(max(D, 1), 28)

    today = now.date()

    # ── Determine start of current billing cycle ──────────────────────────────
    if today.day >= D:
        start_year, start_month = today.year, today.month
    else:
        # Previous month
        if today.month == 1:
            start_year, start_month = today.year - 1, 12
        else:
            start_year, start_month = today.year, today.month - 1

    # billing_start as a timezone-aware datetime (midnight, local tz)
    billing_start = now.replace(
        year=start_year, month=start_month, day=D,
        hour=0, minute=0, second=0, microsecond=0,
    )

    # ── days_elapsed: 1 on billing_start day ─────────────────────────────────
    days_elapsed = (today - billing_start.date()).days + 1

    # ── total_cycle_days: days from billing_start to next billing start ───────
    if start_month == 12:
        next_year, next_month = start_year + 1, 1
    else:
        next_year, next_month = start_year, start_month + 1

    # Build the two boundary dates as plain date objects for easy subtraction
    from datetime import date as _date
    start_date = _date(start_year, start_month, D)
    next_date  = _date(next_year,  next_month,  D)
    total_cycle_days = (next_date - start_date).days

    remaining_days = max(0, total_cycle_days - days_elapsed)

    return {
        "billing_start":    billing_start,
        "days_elapsed":     days_elapsed,
        "total_cycle_days": total_cycle_days,
        "remaining_days":   remaining_days,
    }
