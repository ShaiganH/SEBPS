"""
Bridge to module_1_predictor/predictor.py.
Sys.path is configured in settings.base so 'import predictor' works.
"""

import logging
from typing import List

logger = logging.getLogger(__name__)


def run_prediction(
    history_units: List[int],
    units_so_far: int,
    days_elapsed: int,
    total_cycle_days: int = 30,
    sanctioned_load_kw: float = 2.0,
    protected: bool = False,
    fpa_per_unit: float = -1.597,
    qta_per_unit: float = -1.769,
    phase: str = "single_phase",
    is_tax_filer: bool = False,
) -> dict:
    """
    Call the predictor module and return its full result dict.
    Raises ValueError if history is too short.
    """
    try:
        from predictor import predict  # module_1_predictor/predictor.py

        return predict(
            history_units=history_units,
            units_so_far=units_so_far,
            days_elapsed=days_elapsed,
            total_cycle_days=total_cycle_days,
            sanctioned_load_kw=sanctioned_load_kw,
            protected=protected,
            fpa_per_unit=fpa_per_unit,
            qta_per_unit=qta_per_unit,
            phase=phase,
            is_tax_filer=is_tax_filer,
        )
    except ImportError:
        logger.error("predictor module not found. Check PREDICTOR_MODULE_PATH in settings.")
        raise


def calculate_tariff_bill(units: int, **bill_kwargs) -> dict:
    """Direct tariff calculation without ML — useful for quick estimates."""
    from tariff import calculate_bill  # module_1_predictor/tariff.py
    return calculate_bill(units, **bill_kwargs)
