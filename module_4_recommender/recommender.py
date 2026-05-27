"""
Module 4 — Rule-Based Recommender System.

Workflow
--------
1. User provides their appliance list (name, wattage, hours/day, quantity).
2. User sets a budget (max PKR per month and/or max units per month).
3. recommender.analyse() computes:
   - Each appliance's monthly units and estimated bill contribution.
   - Gap between predicted bill and budget.
   - Ranked recommendations (highest-impact appliances first).
4. recommender.apply_reductions() takes user's chosen hour cuts and computes:
   - Exact units saved (per appliance and total).
   - New predicted bill using the REAL tariff slab calculator (non-linear savings).
   - Whether the budget will now be met.
   - Slab-crossing alerts (extra savings when you drop to a lower slab).

Key insight: Savings are NON-LINEAR due to LESCO's block-rate tariff.
Dropping from 305 → 295 units saves MORE than just 10 × current_rate because
it crosses the slab boundary (201-300 @ Rs 33.10 vs 301-400 @ Rs 36.46).
We always use calculate_bill() for this, never a linear estimate.
"""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'module_1_predictor'))

from tariff import calculate_bill, get_slab

DAYS_PER_MONTH = 30


# ── Data types ────────────────────────────────────────────────────────────────

def make_appliance(
    name: str,
    wattage_w: float,
    hours_per_day: float,
    quantity: int = 1,
    category: str = 'Custom',
) -> dict:
    """Create a user appliance entry."""
    return {
        'name':          name,
        'wattage_w':     wattage_w,
        'hours_per_day': hours_per_day,
        'quantity':      quantity,
        'category':      category,
    }


# ── Core calculations ──────────────────────────────────────────────────────────

def appliance_monthly_units(app: dict) -> float:
    """Units consumed by one appliance in a 30-day billing cycle."""
    return (app['wattage_w'] / 1000) * app['hours_per_day'] * app['quantity'] * DAYS_PER_MONTH


def total_appliance_units(appliances: list[dict]) -> float:
    """Total units from all appliances combined."""
    return sum(appliance_monthly_units(a) for a in appliances)


def units_saved_by_reduction(app: dict, hours_reduced_per_day: float) -> float:
    """Units saved if this appliance is run fewer hours per day."""
    hours_reduced_per_day = min(hours_reduced_per_day, app['hours_per_day'])
    return (app['wattage_w'] / 1000) * hours_reduced_per_day * app['quantity'] * DAYS_PER_MONTH


def bill_impact(
    current_units: int,
    units_to_remove: float,
    bill_kwargs: dict,
) -> dict:
    """
    Calculate the REAL bill difference after removing some units.
    Uses the tariff calculator to handle non-linear slab savings.

    Returns
    -------
    dict
        current_bill   : float
        new_units      : int
        new_bill       : float
        units_saved    : float
        money_saved    : float
        slab_crossed   : bool   — True if this reduction crosses a slab boundary
        slab_bonus_msg : str    — Human-readable explanation of bonus saving
    """
    current_units = max(0, int(current_units))
    new_units     = max(0, int(current_units - units_to_remove))

    current_slab  = get_slab(current_units, bill_kwargs.get('protected', False))
    new_slab      = get_slab(new_units,     bill_kwargs.get('protected', False))
    slab_crossed  = current_slab['slab_ceiling'] != new_slab['slab_ceiling']

    current_bill_data = calculate_bill(current_units, **bill_kwargs)
    new_bill_data     = calculate_bill(new_units,     **bill_kwargs)

    current_bill = current_bill_data['total_payable']
    new_bill     = new_bill_data['total_payable']
    money_saved  = current_bill - new_bill

    slab_bonus_msg = ''
    if slab_crossed:
        slab_bonus_msg = (
            f"Slab drop: {current_units}u @ Rs{current_slab['energy_rate']}/kWh "
            f"→ {new_units}u @ Rs{new_slab['energy_rate']}/kWh — "
            f"ALL units now charged at lower rate!"
        )

    return {
        'current_bill':   round(current_bill,  2),
        'new_units':      new_units,
        'new_bill':       round(new_bill,       2),
        'units_saved':    round(units_to_remove, 1),
        'money_saved':    round(money_saved,    2),
        'slab_crossed':   slab_crossed,
        'slab_bonus_msg': slab_bonus_msg,
    }


# ── Main API ──────────────────────────────────────────────────────────────────

def analyse(
    appliances: list[dict],
    predicted_units: int,
    predicted_bill: float,
    budget_pkr:   float | None = None,
    budget_units: int   | None = None,
    bill_kwargs:  dict  | None = None,
) -> dict:
    """
    Analyse appliances and produce ranked reduction recommendations.

    Parameters
    ----------
    appliances      : User's appliance list (from make_appliance()).
    predicted_units : Module 1 predicted units for the month.
    predicted_bill  : Module 1 predicted bill (PKR).
    budget_pkr      : Optional monthly bill budget (PKR).
    budget_units    : Optional monthly unit budget.
    bill_kwargs     : Tariff params (sanctioned_load_kw, fpa_per_unit, etc.)

    Returns
    -------
    dict — see structure below.
    """
    if bill_kwargs is None:
        bill_kwargs = {
            'sanctioned_load_kw': 2.0,
            'protected':          False,
            'fpa_per_unit':       -1.597,
            'qta_per_unit':       -1.769,
        }

    # ── Per-appliance breakdown ───────────────────────────────────────────────
    breakdown = []
    for app in appliances:
        monthly_u = appliance_monthly_units(app)
        pct       = (monthly_u / predicted_units * 100) if predicted_units > 0 else 0

        # Savings per 1 hour/day reduction
        unit_per_hr  = units_saved_by_reduction(app, 1.0)
        impact_1hr   = bill_impact(predicted_units, unit_per_hr, bill_kwargs)

        breakdown.append({
            'name':               app['name'],
            'wattage_w':          app['wattage_w'],
            'hours_per_day':      app['hours_per_day'],
            'quantity':           app['quantity'],
            'category':           app['category'],
            'monthly_units':      round(monthly_u, 1),
            'pct_of_total':       round(pct, 1),
            'savings_per_1hr':    round(unit_per_hr, 1),   # units saved if run 1hr less/day
            'bill_drop_per_1hr':  impact_1hr['money_saved'],
            'slab_at_1hr':        impact_1hr['slab_crossed'],
        })

    # Sort by monthly_units descending (biggest consumers first)
    breakdown.sort(key=lambda x: x['monthly_units'], reverse=True)

    # ── Budget gap analysis ───────────────────────────────────────────────────
    pkr_gap   = max(0.0, predicted_bill  - (budget_pkr   or predicted_bill))
    units_gap = max(0,   predicted_units - (budget_units or predicted_units))

    # Units needed to save to meet PKR budget (binary search via tariff calc)
    units_to_save_for_pkr = _units_needed_for_budget(
        predicted_units, budget_pkr, bill_kwargs
    ) if budget_pkr else 0

    return {
        'predicted_units':      predicted_units,
        'predicted_bill':       predicted_bill,
        'budget_pkr':           budget_pkr,
        'budget_units':         budget_units,
        'pkr_gap':              round(pkr_gap,  2),
        'units_gap':            units_gap,
        'units_to_save_for_pkr': units_to_save_for_pkr,
        'within_pkr_budget':    pkr_gap   <= 0,
        'within_units_budget':  units_gap <= 0,
        'appliance_breakdown':  breakdown,           # ranked list
        'total_tracked_units':  round(total_appliance_units(appliances), 1),
    }


def apply_reductions(
    appliances:     list[dict],
    reductions:     list[dict],       # [{'name': ..., 'hours_reduced': ...}, ...]
    predicted_units: int,
    bill_kwargs:    dict | None = None,
    budget_pkr:     float | None = None,
    budget_units:   int   | None = None,
) -> dict:
    """
    Apply a set of user-chosen hour reductions and compute exact savings.

    Parameters
    ----------
    reductions : list of {'name': appliance_name, 'hours_reduced': float}

    Returns
    -------
    dict with per-reduction breakdown and final totals.
    """
    if bill_kwargs is None:
        bill_kwargs = {
            'sanctioned_load_kw': 2.0,
            'protected':          False,
            'fpa_per_unit':       -1.597,
            'qta_per_unit':       -1.769,
        }

    app_map = {a['name']: a for a in appliances}
    steps   = []
    running_units = int(predicted_units)

    original_bill = calculate_bill(running_units, **bill_kwargs)['total_payable']

    for red in reductions:
        app = app_map.get(red['name'])
        if app is None:
            continue
        hrs  = min(float(red['hours_reduced']), app['hours_per_day'])
        if hrs <= 0:
            continue

        saved_u  = units_saved_by_reduction(app, hrs)
        impact   = bill_impact(running_units, saved_u, bill_kwargs)

        steps.append({
            'appliance':       red['name'],
            'hours_reduced':   hrs,
            'units_saved':     impact['units_saved'],
            'new_total_units': impact['new_units'],
            'new_bill':        impact['new_bill'],
            'money_saved_step': impact['money_saved'],
            'slab_crossed':    impact['slab_crossed'],
            'slab_bonus_msg':  impact['slab_bonus_msg'],
        })

        running_units = impact['new_units']

    final_bill = calculate_bill(running_units, **bill_kwargs)['total_payable']
    total_saved_units = predicted_units - running_units
    total_saved_pkr   = original_bill   - final_bill

    meets_pkr   = (budget_pkr   is None) or (final_bill     <= budget_pkr)
    meets_units = (budget_units is None) or (running_units  <= budget_units)

    return {
        'original_units':    predicted_units,
        'original_bill':     round(original_bill,  2),
        'steps':             steps,
        'final_units':       running_units,
        'final_bill':        round(final_bill,     2),
        'total_units_saved': round(total_saved_units, 1),
        'total_pkr_saved':   round(total_saved_pkr,   2),
        'meets_pkr_budget':  meets_pkr,
        'meets_units_budget': meets_units,
        'budget_pkr':        budget_pkr,
        'budget_units':      budget_units,
    }


def suggest_to_meet_budget(
    appliances:      list[dict],
    predicted_units: int,
    bill_kwargs:     dict | None = None,
    budget_pkr:      float | None = None,
    budget_units:    int   | None = None,
    max_suggestions: int = 5,
) -> list[dict]:
    """
    Auto-suggest the minimum set of reductions to meet the budget.
    Greedy approach: always reduce the highest-impact appliance first.

    Returns a list of suggested reductions (same format as apply_reductions input).
    """
    if bill_kwargs is None:
        bill_kwargs = {
            'sanctioned_load_kw': 2.0,
            'protected':          False,
            'fpa_per_unit':       -1.597,
            'qta_per_unit':       -1.769,
        }

    # Sort by savings potential (monthly_units desc)
    ranked = sorted(appliances, key=lambda a: appliance_monthly_units(a), reverse=True)

    suggestions   = []
    running_units = int(predicted_units)
    running_bill  = calculate_bill(running_units, **bill_kwargs)['total_payable']

    for app in ranked:
        if len(suggestions) >= max_suggestions:
            break

        # Check if budget already met
        pkr_met   = (budget_pkr   is None) or (running_bill  <= budget_pkr)
        units_met = (budget_units is None) or (running_units <= budget_units)
        if pkr_met and units_met:
            break

        # Try reducing this appliance by increasing increments
        best_hrs = 0.0
        for hrs in [0.5, 1, 2, 3, 4, 6, app['hours_per_day']]:
            hrs = min(hrs, app['hours_per_day'])
            saved_u   = units_saved_by_reduction(app, hrs)
            new_units = max(0, running_units - int(saved_u))
            new_bill  = calculate_bill(new_units, **bill_kwargs)['total_payable']

            pkr_ok   = (budget_pkr   is None) or (new_bill  <= budget_pkr)
            units_ok = (budget_units is None) or (new_units <= budget_units)

            best_hrs = hrs
            if pkr_ok and units_ok:
                break

        if best_hrs > 0:
            saved_u   = units_saved_by_reduction(app, best_hrs)
            new_units = max(0, running_units - int(saved_u))
            new_bill  = calculate_bill(new_units, **bill_kwargs)['total_payable']

            suggestions.append({
                'name':           app['name'],
                'hours_reduced':  best_hrs,
                'units_saved':    round(saved_u, 1),
                'new_total_units': new_units,
                'new_bill':       round(new_bill, 2),
            })

            running_units = new_units
            running_bill  = new_bill

    return suggestions


# ── Internal helper ───────────────────────────────────────────────────────────

def _units_needed_for_budget(
    predicted_units: int,
    budget_pkr: float,
    bill_kwargs: dict,
) -> int:
    """Binary search: how many units to remove to get bill ≤ budget_pkr."""
    if calculate_bill(predicted_units, **bill_kwargs)['total_payable'] <= budget_pkr:
        return 0
    lo, hi = 0, predicted_units
    while lo < hi:
        mid      = (lo + hi) // 2
        new_bill = calculate_bill(predicted_units - mid, **bill_kwargs)['total_payable']
        if new_bill <= budget_pkr:
            hi = mid
        else:
            lo = mid + 1
    return lo
