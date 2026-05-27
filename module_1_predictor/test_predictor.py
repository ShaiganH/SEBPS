"""
Integration test using real data from LESCO bill (Customer ID 3016606, AUG-25).

History extracted from the bill image:
    AUG-24: 521 u   SEP-24: 444 u   OCT-24: 250 u   NOV-24: 156 u
    DEC-24:  94 u   JAN-25: 112 u   FEB-25:  88 u   MAR-25:  89 u
    APR-25: 133 u   MAY-25: 291 u   JUN-25: 440 u   JUL-25: 382 u

Current cycle (AUG-25): 214 units read off the bill so far.
Bill parameters:  Tariff A-1a(01), Sanctioned load 2 kW, single-phase.
FPA / QTA rates derived from the same AUG-25 bill.
"""

from predictor import predict

# ── Real data ─────────────────────────────────────────────────────────────────

HISTORY = [521, 444, 250, 156, 94, 112, 88, 89, 133, 291, 440, 382]
MONTHS  = ['AUG-24','SEP-24','OCT-24','NOV-24','DEC-24','JAN-25',
           'FEB-25','MAR-25','APR-25','MAY-25','JUN-25','JUL-25']

BILL_PARAMS = dict(
    sanctioned_load_kw = 2.0,
    protected          = False,   # consumer has months > 200 units
    fpa_per_unit       = -1.597,  # from AUG-25 bill: -341.97 / 214
    qta_per_unit       = -1.769,  # from AUG-25 bill: -378.67 / 214
    phase              = 'single_phase',
    is_tax_filer       = False,
)

# ── Display helpers ───────────────────────────────────────────────────────────

def _bar(width: int = 62) -> str:
    return '─' * width

def print_report(result: dict, title: str = '') -> None:
    W = 62
    print(f"\n{'═'*W}")
    if title:
        print(f"  {title}")
        print('═'*W)

    inp = result['input']
    print(f"  History : {inp['history_months']} months | Consumer: {inp['consumer_type']}")
    print(f"  Cycle   : {inp['days_elapsed']} / {inp['total_cycle_days']} days elapsed")
    print(f"  Units   : {inp['units_so_far']} so far  |  Daily avg: {inp['daily_avg']} u/day")

    # Model comparison table
    print(f"\n  {'Model':<24} {'Pred (u)':>8} {'Est Bill (Rs)':>14} {'LOO MAE':>9}")
    print(f"  {_bar(57)}")
    best = result['best_historical']['name']
    for name, d in result['model_comparison'].items():
        marker = '  ← best hist.' if name == best else ''
        print(f"  {name:<24} {d['predicted_units']:>8,} {d['predicted_pkr']:>14,.0f} "
              f"{d['loo_mae']:>9.1f}{marker}")

    dp = result['daily_projection']
    print(f"  {'Daily Projection':<24} {dp['predicted_units']:>8,} {dp['predicted_pkr']:>14,.0f}"
          f"{'':>9}  (current-cycle)")

    # Confidence
    conf = result['confidence']
    bl   = result['blended']
    print(f"\n  Confidence weights:")
    print(f"    History    {conf['history_weight_pct']:>5.1f}%  →  {result['best_historical']['predicted_units']:>4} u")
    print(f"    Projection {conf['projection_weight_pct']:>5.1f}%  →  {dp['predicted_units']:>4} u")
    print(f"    Blended                →  {bl['predicted_units']:>4} u  (Rs {bl['predicted_pkr']:,.0f})")

    # Final prediction
    pred = result['prediction']
    bill = pred['bill']
    print(f"\n  ✔  FINAL PREDICTION  [{conf['primary_source']}]")
    print(f"  {'─'*W}")
    print(f"  Predicted units      : {pred['units']:>6,}")
    print(f"  Slab                 : {bill['slab_label']}")
    print(f"  {'─'*W}")
    print(f"  {'LESCO CHARGES':}")
    print(f"    Energy cost        : Rs {bill['energy_cost']:>9,.2f}"
          f"  ({bill['units_consumed']} u × {bill['slab_rate']})")
    print(f"    Fixed charge       : Rs {bill['fixed_charge']:>9,.2f}")
    print(f"    FPA                : Rs {bill['fpa']:>9,.2f}")
    print(f"    QTA                : Rs {bill['qta']:>9,.2f}")
    print(f"    LESCO subtotal     : Rs {bill['lesco_total']:>9,.2f}")
    print(f"  {'GOVERNMENT CHARGES':}")
    print(f"    Electricity duty   : Rs {bill['electricity_duty']:>9,.2f}")
    print(f"    TV fee             : Rs {bill['tv_fee']:>9,.2f}")
    print(f"    GST (18%)          : Rs {bill['gst']:>9,.2f}")
    print(f"    GST on FPA         : Rs {bill['gst_on_fpa']:>9,.2f}")
    print(f"    ED on FPA          : Rs {bill['ed_on_fpa']:>9,.2f}")
    print(f"    Income tax         : Rs {bill['income_tax']:>9,.2f}")
    print(f"    Govt subtotal      : Rs {bill['govt_total']:>9,.2f}")
    print(f"  {'─'*W}")
    print(f"  TOTAL PAYABLE        : Rs {bill['total_payable']:>9,.2f}")
    print(f"{'═'*W}")


# ── Scenarios ─────────────────────────────────────────────────────────────────

def test_cycle_progression():
    """
    Show how the prediction shifts as the billing cycle progresses.
    All scenarios use the same history; only days_elapsed and units_so_far change.
    """
    scenarios = [
        # (label,              units_so_far, days_elapsed)
        ('Day  5  — Early  (5/30)',    35,   5),
        ('Day 10  — Early  (10/30)',   71,  10),
        ('Day 15  — Mid    (15/30)',  107,  15),
        ('Day 21  — Actual (21/30)',  214,  21),   # real bill reading
        ('Day 25  — Late   (25/30)',  255,  25),
        ('Day 29  — Final  (29/30)',  296,  29),
    ]

    for label, units, days in scenarios:
        result = predict(HISTORY, units, days, total_cycle_days=30, **BILL_PARAMS)
        print_report(result, title=label)


def test_tariff_validation():
    """
    Cross-check our tariff module against the known values from the real bill.
    Bill: 214 units, energy cost = 7,082.97, FPA = -341.97, Fixed = ~700.
    """
    from tariff import calculate_bill
    bill = calculate_bill(214, **BILL_PARAMS)

    print('\n' + '='*62)
    print('  TARIFF VALIDATION  (214 units, real AUG-25 bill)')
    print('='*62)

    checks = [
        ('Energy cost  (expect ~7,082.97)', bill['energy_cost'],       7082.97),
        ('Fixed charge (expect ~700.00)',   bill['fixed_charge'],        700.00),
        ('FPA          (expect ~-341.77)',  bill['fpa'],                -341.77),
        ('QTA          (expect ~-378.57)',  bill['qta'],                -378.57),
        ('Elec duty    (expect ~100.58)',   bill['electricity_duty'],    100.58),
    ]

    all_pass = True
    for label, actual, expected in checks:
        diff = abs(actual - expected)
        ok   = '✓' if diff < 5 else '✗'
        if diff >= 5:
            all_pass = False
        print(f"  {ok}  {label:<38}  got {actual:>9,.2f}  (Δ{diff:.2f})")

    print(f"\n  Total payable: Rs {bill['total_payable']:,.2f}")
    print(f"  {'All checks passed ✓' if all_pass else 'Some checks failed — review tariff.py'}")
    print('='*62)


def test_history_display():
    """Print the 12-month history used for context."""
    print('\n' + '='*62)
    print('  INPUT HISTORY  (Customer 3016606)')
    print('='*62)
    print(f"  {'Month':<10} {'Units':>6}")
    print(f"  {'-'*18}")
    for month, units in zip(MONTHS, HISTORY):
        print(f"  {month:<10} {units:>6,}")
    import numpy as np
    print(f"  {'-'*18}")
    print(f"  {'Mean':<10} {int(round(sum(HISTORY)/len(HISTORY))):>6,}")
    print(f"  {'Min':<10} {min(HISTORY):>6,}")
    print(f"  {'Max':<10} {max(HISTORY):>6,}")
    print('='*62)


if __name__ == '__main__':
    test_history_display()
    test_tariff_validation()
    test_cycle_progression()
