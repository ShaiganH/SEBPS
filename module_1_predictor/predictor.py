"""
Main prediction pipeline.

Workflow
--------
1. Run all 6 historical models on the user's history.
2. Rank them by Leave-One-Out MAE → select the best.
3. Run the daily projection (current meter reading).
4. Blend the two predictions using a confidence score that shifts from
   "trust history" early in the cycle to "trust daily projection" late.
5. Return a full report: model comparison table + itemised bill estimate.

Confidence logic
----------------
cycle_progress = days_elapsed / total_cycle_days   (0.0 → 1.0)

A sigmoid centred at 50% cycle progress drives the projection weight:
    projection_weight = sigmoid(10 × (cycle_progress − 0.5))

This means:
    Day  5 / 30  →  ~7 % projection,  ~93 % history
    Day 15 / 30  →  ~50% / ~50%
    Day 25 / 30  →  ~93% projection,  ~7 % history

The history weight is additionally scaled by the historical stability
(1 − coefficient_of_variation), so noisy history gets less weight.

Display rule
------------
If projection_weight ≥ 70 % → show daily projection.
If history_weight    ≥ 70 % → show best historical model.
Otherwise              → show the blended value.
"""

import numpy as np
from typing import List

from models import (
    holt_winters, seasonal_ewma, weighted_moving_average,
    ewma_prediction, seasonal_naive, linear_trend,
    daily_projection, leave_one_out_cv,
)
from tariff import calculate_bill, is_consumer_protected


# Registry: name → (function, kwargs)
_HISTORICAL_MODELS = {
    'Holt-Winters':       (holt_winters,            {}),
    'Seasonal EWMA':      (seasonal_ewma,            {'alpha': 0.3}),
    'Weighted MA (6m)':   (weighted_moving_average,  {'n': 6}),
    'EWMA':               (ewma_prediction,           {'alpha': 0.3}),
    'Seasonal Naive':     (seasonal_naive,            {}),
    'Linear Trend':       (linear_trend,              {}),
}


# ── Confidence ────────────────────────────────────────────────────────────────

def _blend_weights(
    days_elapsed: int,
    total_cycle_days: int,
    history: List[int],
) -> tuple[float, float]:
    """
    Returns (history_weight, projection_weight), both summing to 1.0.
    """
    progress = min(days_elapsed / max(total_cycle_days, 1), 1.0)

    # Sigmoid: 0 early in cycle, 1 late
    projection_conf = 1.0 / (1.0 + np.exp(-10.0 * (progress - 0.5)))

    # Penalise noisy history
    mean_h = np.mean(history)
    cv     = (np.std(history) / mean_h) if mean_h > 0 else 1.0
    history_stability = max(0.0, 1.0 - min(cv, 1.0))

    history_conf  = history_stability * (1.0 - projection_conf)

    total = history_conf + projection_conf
    if total == 0:
        return 0.5, 0.5
    return history_conf / total, projection_conf / total


# ── Public API ────────────────────────────────────────────────────────────────

def predict(
    history_units: List[int],
    units_so_far: int,
    days_elapsed: int,
    total_cycle_days: int = 30,
    # bill calculation kwargs (forwarded to tariff.calculate_bill)
    sanctioned_load_kw: float = 2.0,
    protected: bool | None = None,
    fpa_per_unit: float = -1.597,
    qta_per_unit: float = -1.769,
    phase: str = 'single_phase',
    is_tax_filer: bool = False,
) -> dict:
    """
    Full prediction + bill estimation for one user.

    Parameters
    ----------
    history_units     : Monthly units consumed, oldest first (12 months recommended).
    units_so_far      : Units consumed so far in the *current* (incomplete) cycle.
    days_elapsed      : Days elapsed in the current billing cycle.
    total_cycle_days  : Total days in the billing cycle (ask user or default 30).
    sanctioned_load_kw: Customer sanctioned load in kW (from bill header).
    protected         : True/False/None.  None = auto-detect from history.
    fpa_per_unit      : Current month's FPA (PKR/unit, usually negative).
    qta_per_unit      : Current quarter's QTA (PKR/unit, usually negative).
    phase             : 'single_phase' or 'three_phase'.
    is_tax_filer      : Affects income tax withholding rate.

    Returns
    -------
    Nested dict — see structure below.
    """
    if len(history_units) < 2:
        raise ValueError("Need at least 2 months of history.")

    if protected is None:
        protected = is_consumer_protected(history_units)

    bill_kwargs = dict(
        sanctioned_load_kw=sanctioned_load_kw,
        protected=protected,
        fpa_per_unit=fpa_per_unit,
        qta_per_unit=qta_per_unit,
        phase=phase,
        is_tax_filer=is_tax_filer,
    )

    # ── 1. Historical models + LOO CV ─────────────────────────────────────────
    model_results = {}
    for name, (fn, kwargs) in _HISTORICAL_MODELS.items():
        pred = fn(history_units, **kwargs)
        mae  = leave_one_out_cv(history_units, fn, **kwargs)
        bill = calculate_bill(pred, **bill_kwargs)
        model_results[name] = {
            'predicted_units': pred,
            'predicted_pkr':   bill['total_payable'],
            'loo_mae':         round(mae, 1),
        }

    best_name  = min(model_results, key=lambda k: model_results[k]['loo_mae'])
    best_units = model_results[best_name]['predicted_units']

    # ── 2. Daily projection ───────────────────────────────────────────────────
    proj_units = daily_projection(units_so_far, days_elapsed, total_cycle_days)
    proj_bill  = calculate_bill(proj_units, **bill_kwargs)

    # ── 3. Blend ──────────────────────────────────────────────────────────────
    hw, pw = _blend_weights(days_elapsed, total_cycle_days, history_units)
    blended_units = int(round(hw * best_units + pw * proj_units))
    blended_bill  = calculate_bill(blended_units, **bill_kwargs)

    # ── 4. Display decision ───────────────────────────────────────────────────
    if pw >= 0.70:
        source        = 'Daily Projection'
        display_units = proj_units
    elif hw >= 0.70:
        source        = f'Historical ({best_name})'
        display_units = best_units
    else:
        source        = 'Blended'
        display_units = blended_units

    final_bill = calculate_bill(display_units, **bill_kwargs)

    daily_avg = round(units_so_far / days_elapsed, 2) if days_elapsed > 0 else 0

    return {
        'input': {
            'history_months':  len(history_units),
            'units_so_far':    units_so_far,
            'days_elapsed':    days_elapsed,
            'total_cycle_days': total_cycle_days,
            'daily_avg':       daily_avg,
            'consumer_type':   'Protected' if protected else 'Unprotected',
        },

        # Full comparison table for the FYP report / UI
        'model_comparison': model_results,

        'best_historical': {
            'name':            best_name,
            'predicted_units': best_units,
            'predicted_pkr':   model_results[best_name]['predicted_pkr'],
            'loo_mae':         model_results[best_name]['loo_mae'],
        },

        'daily_projection': {
            'predicted_units': proj_units,
            'predicted_pkr':   proj_bill['total_payable'],
        },

        'blended': {
            'predicted_units':  blended_units,
            'predicted_pkr':    blended_bill['total_payable'],
            'history_weight':   round(hw, 3),
            'projection_weight': round(pw, 3),
        },

        'confidence': {
            'primary_source':        source,
            'history_weight_pct':    round(hw * 100, 1),
            'projection_weight_pct': round(pw * 100, 1),
        },

        # ← This is what the app displays to the user
        'prediction': {
            'units': display_units,
            'bill':  final_bill,
        },
    }
