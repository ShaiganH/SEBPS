"""
Prediction models for monthly electricity consumption.
All models take a list of historical units (oldest → newest) and return
an integer forecast for the *next* month.

Models implemented
------------------
Historical (use past months to forecast):
  1. Holt-Winters Exponential Smoothing  — handles level + trend + seasonality
  2. Seasonal EWMA                       — EWMA applied on de-seasonalised data
  3. Weighted Moving Average (6-month)   — simple, recent months weighted higher
  4. EWMA                                — plain exponential smoothing
  5. Seasonal Naive                      — "same month last year" baseline
  6. Linear Trend                        — OLS on time index (ignores seasonality)

Current-cycle (uses live meter reading):
  7. Daily Projection                    — (units_so_far / days_elapsed) × cycle_days

Evaluation
----------
  leave_one_out_cv() — LOO Mean Absolute Error; used to rank historical models.
"""

import warnings
import numpy as np
from typing import List


# ── Historical models ─────────────────────────────────────────────────────────

def holt_winters(history: List[int], seasonal_period: int = 12) -> int:
    """
    Triple exponential smoothing (Holt-Winters).
    Falls back to Holt (trend only, no seasonality) when history < 2 seasons,
    and to manual implementation when statsmodels is unavailable.
    """
    try:
        from statsmodels.tsa.holtwinters import ExponentialSmoothing

        data = [float(x) for x in history]

        if len(data) >= 2 * seasonal_period:
            model = ExponentialSmoothing(
                data, trend='add', seasonal='add',
                seasonal_periods=seasonal_period,
                damped_trend=True,
                initialization_method='estimated',
            )
        else:
            # Single season: use additive seasonal with fixed initialisation
            model = ExponentialSmoothing(
                data, trend='add', seasonal='add',
                seasonal_periods=seasonal_period,
                damped_trend=True,
                initialization_method='heuristic',
            )

        with warnings.catch_warnings():
            warnings.simplefilter('ignore')
            fit = model.fit(optimized=True)

        forecast = float(fit.forecast(1)[0])
        return int(round(max(0, forecast)))

    except Exception:
        return _manual_holt_winters(history, seasonal_period)


def _manual_holt_winters(history: List[int], m: int = 12) -> int:
    """Additive Holt-Winters without external dependencies."""
    if len(history) < m:
        return seasonal_naive(history)

    alpha, beta, gamma = 0.3, 0.1, 0.3
    h = [float(x) for x in history]

    L = np.mean(h[:m])
    T = ((np.mean(h[m:2*m]) - L) / m) if len(h) >= 2 * m else 0.0
    S = [h[i] / L if L != 0 else 1.0 for i in range(m)]

    for t in range(m, len(h)):
        y = h[t]
        s_idx = t % m
        L_prev, T_prev = L, T
        L = alpha * (y - S[s_idx]) + (1 - alpha) * (L_prev + T_prev)
        T = beta  * (L - L_prev)   + (1 - beta)  * T_prev
        S[s_idx] = gamma * (y - L) + (1 - gamma) * S[s_idx]

    s_next = len(history) % m
    return int(round(max(0.0, L + T + S[s_next])))


def seasonal_ewma(history: List[int], alpha: float = 0.3, seasonal_period: int = 12) -> int:
    """
    EWMA on de-seasonalised data, then re-apply seasonal factor.
    Works well when the seasonal pattern is stable but the level drifts.
    """
    if len(history) < seasonal_period:
        return ewma_prediction(history, alpha)

    overall_mean = np.mean(history)
    if overall_mean == 0:
        return history[-1]

    seasonal_indices = [h / overall_mean for h in history]
    deseasonalised   = [h / si if si != 0 else h for h, si in zip(history, seasonal_indices)]

    trend_level  = ewma_prediction([int(x) for x in deseasonalised], alpha)
    next_si      = seasonal_indices[-seasonal_period]          # same month last year

    return int(round(max(0, trend_level * next_si)))


def weighted_moving_average(history: List[int], n: int = 6) -> int:
    """Linearly weighted average of the last n months (most recent = highest weight)."""
    recent  = history[-n:]
    weights = np.arange(1, len(recent) + 1, dtype=float)
    weights /= weights.sum()
    return int(round(float(np.dot(weights, recent))))


def ewma_prediction(history: List[int], alpha: float = 0.3) -> int:
    """Plain exponential smoothing — good for slowly changing levels."""
    val = float(history[0])
    for obs in history[1:]:
        val = alpha * float(obs) + (1.0 - alpha) * val
    return int(round(val))


def seasonal_naive(history: List[int], seasonal_period: int = 12) -> int:
    """Predict next month = same calendar month last year. Strong and simple baseline."""
    if len(history) < seasonal_period:
        return history[-1]
    return history[-seasonal_period]


def linear_trend(history: List[int]) -> int:
    """OLS regression on time index. Useful comparison; ignores seasonal pattern."""
    n = len(history)
    x = np.arange(n, dtype=float)
    slope, intercept = np.polyfit(x, history, 1)
    return int(round(max(0.0, intercept + slope * n)))


# ── Current-cycle model ───────────────────────────────────────────────────────

def daily_projection(
    units_so_far: int,
    days_elapsed: int,
    total_cycle_days: int = 30,
) -> int:
    """
    Project full-month units from current meter reading.
        daily_avg  = units_so_far / days_elapsed
        projection = daily_avg × total_cycle_days
    Returns 0 if days_elapsed == 0 (can't project yet).
    """
    if days_elapsed <= 0:
        return 0
    daily_avg = units_so_far / days_elapsed
    return int(round(daily_avg * total_cycle_days))


# ── Evaluation ────────────────────────────────────────────────────────────────

def leave_one_out_cv(history: List[int], model_fn, **kwargs) -> float:
    """
    Leave-one-out cross-validation.
    Trains on history[:i] and predicts history[i] for i in [min_train, n).
    Returns mean absolute error (MAE) — lower is better.
    min_train = 6 so models have enough data for a meaningful fit.
    """
    min_train = 6
    errors = []
    for i in range(min_train, len(history)):
        try:
            pred   = model_fn(history[:i], **kwargs)
            errors.append(abs(pred - history[i]))
        except Exception:
            errors.append(float('inf'))

    return float(np.mean(errors)) if errors else float('inf')
