"""
IoT consumption service — converts raw IoT readings into PKR cost for
budget tracking and smart recommendations.
"""
import logging

from django.db.models import Max, Min
from django.utils import timezone

logger = logging.getLogger(__name__)


def get_iot_consumption(user, days: int = 30) -> dict:
    """
    Return energy (kWh) and estimated PKR cost consumed by all of the user's
    active IoT devices during the **current billing cycle**.

    The billing cycle window is derived from ``user.billing_cycle_day`` via
    :func:`services.billing_utils.get_billing_cycle`.  The ``days`` parameter
    is kept for backward-compatibility but is no longer used as the window
    start — the user's actual cycle start is always used instead.

    Energy is computed as  Max(cumulative_energy) − Min(cumulative_energy)
    for readings within the window — this correctly handles devices that
    send a running total (cumulative kWh counter, like a real energy meter).

    Returns::

        {
          "units_kwh": 45.3,
          "cost_pkr":  1498.23,
          "has_data":  True,
          "device_count": 1,
        }
    """
    from apps.iot.models import IoTDevice, IoTReading
    from services.billing_utils import get_billing_cycle

    cycle = get_billing_cycle(user)
    since = cycle["billing_start"]
    devices = IoTDevice.objects.filter(user=user, is_active=True)

    total_energy_kwh = 0.0
    device_count = 0

    for device in devices:
        agg = IoTReading.objects.filter(device=device, time__gte=since).aggregate(
            max_e=Max("energy"), min_e=Min("energy")
        )
        if agg["max_e"] is not None and agg["min_e"] is not None:
            delta = max(0.0, agg["max_e"] - agg["min_e"])
            total_energy_kwh += delta
            device_count += 1

    has_data = total_energy_kwh > 0
    cost_pkr = _kwh_to_pkr(total_energy_kwh, user)

    return {
        "units_kwh": round(total_energy_kwh, 4),
        "cost_pkr": round(cost_pkr, 2),
        "has_data": has_data,
        "device_count": device_count,
    }


def _kwh_to_pkr(kwh: float, user) -> float:
    """Convert kWh to PKR using the LESCO tariff module."""
    if kwh <= 0:
        return 0.0
    units = round(kwh)  # LESCO bills in whole units
    try:
        from tariff import calculate_bill
        bill = calculate_bill(units=units, **user.bill_kwargs)
        return float(bill.get("total_payable", 0))
    except Exception as e:
        logger.warning(f"Tariff calculation failed ({e}), using flat rate")
        # Mid-range unprotected slab fallback
        return kwh * 33.10
