"""
Bridge to module_4_recommender/recommender.py.
"""

import logging
from typing import List

logger = logging.getLogger(__name__)


def _to_recommender_appliances(appliances) -> list:
    """Convert UserAppliance ORM objects or dicts to recommender-compatible dicts."""
    result = []
    for app in appliances:
        if hasattr(app, "wattage_w"):
            result.append({
                "name": app.name,
                "wattage_w": app.wattage_w,
                "hours_per_day": app.hours_per_day,
                "quantity": app.quantity,
                "category": app.category,
            })
        else:
            result.append(app)
    return result


def run_analysis(
    appliances,
    predicted_units: int,
    predicted_bill: float,
    budget_pkr: float = None,
    budget_units: int = None,
    bill_kwargs: dict = None,
) -> dict:
    """
    Run recommender.analyse() and return the full analysis dict.
    """
    try:
        from recommender import analyse  # module_4_recommender/recommender.py

        apps = _to_recommender_appliances(appliances)
        return analyse(
            appliances=apps,
            predicted_units=predicted_units,
            predicted_bill=predicted_bill,
            budget_pkr=budget_pkr,
            budget_units=budget_units,
            bill_kwargs=bill_kwargs or {},
        )
    except ImportError:
        logger.error("Recommender module not found. Check RECOMMENDER_MODULE_PATH in settings.")
        raise


def run_apply_reductions(
    appliances,
    reductions: List[dict],
    predicted_units: int,
    bill_kwargs: dict = None,
    budget_pkr: float = None,
    budget_units: int = None,
) -> dict:
    """
    Run recommender.apply_reductions() and return result dict.
    """
    try:
        from recommender import apply_reductions

        apps = _to_recommender_appliances(appliances)
        return apply_reductions(
            appliances=apps,
            reductions=reductions,
            predicted_units=predicted_units,
            bill_kwargs=bill_kwargs or {},
            budget_pkr=budget_pkr,
            budget_units=budget_units,
        )
    except ImportError:
        logger.error("Recommender module not found.")
        raise


def run_auto_suggest(
    appliances,
    predicted_units: int,
    bill_kwargs: dict = None,
    budget_pkr: float = None,
    budget_units: int = None,
) -> list:
    """Run recommender.suggest_to_meet_budget()."""
    try:
        from recommender import suggest_to_meet_budget

        apps = _to_recommender_appliances(appliances)
        return suggest_to_meet_budget(
            appliances=apps,
            predicted_units=predicted_units,
            bill_kwargs=bill_kwargs or {},
            budget_pkr=budget_pkr,
            budget_units=budget_units,
        )
    except ImportError:
        logger.error("Recommender module not found.")
        raise
