"""
LESCO / IESCO A-1 Residential Tariff  (S.R.O No. 279(I)/2026)
Source: https://www.iesco.com.pk/tariff-guide

Billing model: NON-TELESCOPING (block rate).
When a consumer falls into a slab, ALL units that month are billed at that slab's rate —
not just the units above the threshold.  Confirmed from real bill: 214 units × 33.10 = 7,082.97
"""

# ── Slab tables ──────────────────────────────────────────────────────────────
# (max_units_inclusive, energy_rate_pkr_per_kwh, fixed_charge_pkr_per_kw_per_month)

UNPROTECTED_SLABS = [
    (100,        22.44, 275),
    (200,        28.91, 300),
    (300,        33.10, 350),   # ← confirmed from sample bill
    (400,        36.46, 400),
    (500,        38.95, 500),
    (600,        40.22, 675),
    (700,        41.85, 675),
    (float('inf'), 47.20, 675),
]

# Protected consumers: sanctioned load ≤ 5 kW AND typically ≤ 200 units/month.
# Lifeline rows (≤50 and ≤100) carry no fixed charge.
PROTECTED_SLABS = [
    (50,         3.95,  0),    # Lifeline
    (100,        7.74,  0),    # Lifeline
    (100,       10.54, 200),   # Protected Slab 1  (non-lifeline, ≤100)
    (200,       13.01, 300),   # Protected Slab 2
    (float('inf'), 22.44, 275), # Falls into unprotected rates above 200 units
]

# ── Per-unit government levies ────────────────────────────────────────────────
ELECTRICITY_DUTY_PER_UNIT = 0.47   # derived: 100.57 / 214 from sample bill

# ── Flat government fees ──────────────────────────────────────────────────────
TV_FEE_PKR = 35   # PTV licence fee (flat per month)

# ── Tax rates ─────────────────────────────────────────────────────────────────
GST_RATE = 0.18                    # 18% GST on energy + fixed charges
INCOME_TAX_RATE_FILER = 0.07
INCOME_TAX_RATE_NON_FILER = 0.125
INCOME_TAX_THRESHOLD_PKR = 25_000  # Only applied when bill > this amount

# ── Variable NEPRA adjustments (change monthly/quarterly) ────────────────────
# Values below are from the AUG-25 LESCO bill (Customer 3016606).
# The auto-fetcher (Module 3) will supply live values once built.
DEFAULT_FPA_PER_UNIT = -1.597   # Fuel Price Adjustment
DEFAULT_QTA_PER_UNIT = -1.769   # Quarterly Tariff Adjustment

# ── Minimum monthly charges ───────────────────────────────────────────────────
MIN_CHARGE = {'single_phase': 75, 'three_phase': 150}


# ── Helpers ───────────────────────────────────────────────────────────────────

def is_consumer_protected(history_units: list[int]) -> bool:
    """
    A consumer is unprotected if ANY month in the past 3 months exceeded 200 units.
    Falls back to checking full history if fewer than 3 months available.
    """
    check = history_units[-3:] if len(history_units) >= 3 else history_units
    return all(u <= 200 for u in check)


def get_slab(units: int, protected: bool = False) -> dict:
    slabs = PROTECTED_SLABS if protected else UNPROTECTED_SLABS
    for max_u, energy_rate, fixed_rate in slabs:
        if units <= max_u:
            return {
                'energy_rate': energy_rate,
                'fixed_rate_per_kw': fixed_rate,
                'slab_ceiling': max_u,
            }
    last = slabs[-1]
    return {'energy_rate': last[1], 'fixed_rate_per_kw': last[2], 'slab_ceiling': last[0]}


# ── Main calculation ──────────────────────────────────────────────────────────

def calculate_bill(
    units: int,
    sanctioned_load_kw: float = 2.0,
    protected: bool = False,
    fpa_per_unit: float = DEFAULT_FPA_PER_UNIT,
    qta_per_unit: float = DEFAULT_QTA_PER_UNIT,
    phase: str = 'single_phase',
    is_tax_filer: bool = False,
    late_payment_surcharge: float = 0.0,
) -> dict:
    """
    Calculate a full LESCO electricity bill.

    Parameters
    ----------
    units               : Total units consumed in the billing month.
    sanctioned_load_kw  : Customer's sanctioned load (kW).  Default 2 kW.
    protected           : True for protected / lifeline consumers.
    fpa_per_unit        : Fuel Price Adjustment (PKR/unit, usually negative).
    qta_per_unit        : Quarterly Tariff Adjustment (PKR/unit, usually negative).
    phase               : 'single_phase' or 'three_phase'.
    is_tax_filer        : Affects withholding income tax rate.
    late_payment_surcharge : LP surcharge if previous dues unpaid (PKR, flat amount).

    Returns
    -------
    dict with itemised LESCO charges, government charges, and total payable.
    """
    units = max(0, int(units))
    slab = get_slab(units, protected)

    # ── LESCO Charges ─────────────────────────────────────────────────────────
    energy_cost   = units * slab['energy_rate']
    fixed_charge  = slab['fixed_rate_per_kw'] * sanctioned_load_kw
    fpa_amount    = units * fpa_per_unit
    qta_amount    = units * qta_per_unit
    lesco_subtotal = energy_cost + fixed_charge + fpa_amount + qta_amount
    lesco_subtotal = max(lesco_subtotal, MIN_CHARGE[phase])

    # ── Government Charges ────────────────────────────────────────────────────
    elec_duty     = units * ELECTRICITY_DUTY_PER_UNIT
    tv_fee        = TV_FEE_PKR
    gst           = (energy_cost + fixed_charge) * GST_RATE   # GST on base only, not FPA
    gst_on_fpa    = fpa_amount * GST_RATE
    ed_on_fpa     = fpa_amount * ELECTRICITY_DUTY_PER_UNIT    # negative when FPA is negative

    it_rate = INCOME_TAX_RATE_FILER if is_tax_filer else INCOME_TAX_RATE_NON_FILER
    income_tax = (energy_cost * it_rate) if lesco_subtotal > INCOME_TAX_THRESHOLD_PKR else 0.0

    govt_subtotal = elec_duty + tv_fee + gst + gst_on_fpa + ed_on_fpa + income_tax

    # ── Total ─────────────────────────────────────────────────────────────────
    total = lesco_subtotal + govt_subtotal + late_payment_surcharge

    slab_label = (
        f"{'Protected' if protected else 'Unprotected'} "
        f"≤{slab['slab_ceiling']} units @ Rs {slab['energy_rate']}/kWh"
    )

    return {
        # Summary
        'units_consumed': units,
        'slab_label': slab_label,
        'slab_rate': slab['energy_rate'],

        # LESCO charges
        'energy_cost':   round(energy_cost, 2),
        'fixed_charge':  round(fixed_charge, 2),
        'fpa':           round(fpa_amount, 2),
        'qta':           round(qta_amount, 2),
        'lesco_total':   round(lesco_subtotal, 2),

        # Government charges
        'electricity_duty':  round(elec_duty, 2),
        'tv_fee':            round(tv_fee, 2),
        'gst':               round(gst, 2),
        'gst_on_fpa':        round(gst_on_fpa, 2),
        'ed_on_fpa':         round(ed_on_fpa, 2),
        'income_tax':        round(income_tax, 2),
        'govt_total':        round(govt_subtotal, 2),

        # Optional surcharge
        'lp_surcharge':     round(late_payment_surcharge, 2),

        # Final
        'total_payable':    round(total, 2),
    }
