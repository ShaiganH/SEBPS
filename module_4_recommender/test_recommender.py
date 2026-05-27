"""
Tests for Module 4 — Recommender System.

Uses real data from the bill (08 11274 1172000U, predicted ~306 units for AUG-25).
Simulates a typical Pakistani household appliance set.
"""

import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'module_1_predictor'))

from recommender import (
    make_appliance, analyse, apply_reductions,
    suggest_to_meet_budget, appliance_monthly_units,
)
from appliances import DEFAULT_APPLIANCES, list_by_category

W = 66

# ── Shared test data ──────────────────────────────────────────────────────────

# Predicted from Module 1 for 08 11274 1172000U (AUG-25, day 21)
PREDICTED_UNITS = 306
PREDICTED_BILL  = 12_940.0

BILL_KWARGS = dict(
    sanctioned_load_kw = 2.0,
    protected          = False,
    fpa_per_unit       = -1.597,
    qta_per_unit       = -1.769,
)

# Typical household appliance setup (user-defined)
USER_APPLIANCES = [
    make_appliance('Air Conditioner (1.5 ton)', 1500, hours_per_day=8,  quantity=1, category='Cooling'),
    make_appliance('Ceiling Fan',                 75, hours_per_day=12, quantity=4, category='Cooling'),
    make_appliance('Refrigerator (large)',        200, hours_per_day=24, quantity=1, category='Kitchen'),
    make_appliance('Electric Geyser (large)',    3000, hours_per_day=1,  quantity=1, category='Heating'),
    make_appliance('LED TV (43")',                 70, hours_per_day=5,  quantity=2, category='Entertainment'),
    make_appliance('Washing Machine (auto)',      500, hours_per_day=1,  quantity=1, category='Laundry'),
    make_appliance('Water Pump (1 HP)',           750, hours_per_day=2,  quantity=1, category='Utility'),
    make_appliance('LED Bulb (9W)',                 9, hours_per_day=6,  quantity=8, category='Lighting'),
    make_appliance('Laptop',                       65, hours_per_day=6,  quantity=2, category='Office'),
    make_appliance('WiFi Router',                  10, hours_per_day=24, quantity=1, category='Office'),
]


def _bar(n=W): return '─' * n


# ── Test 1: Appliance database ────────────────────────────────────────────────

def test_appliance_db():
    print('\n' + '=' * W)
    print('  TEST 1 — Appliance Database')
    print('=' * W)

    categories = list_by_category()
    total = sum(len(v) for v in categories.values())
    print(f"\n  Total appliances in database : {total}")
    print(f"  Categories                   : {len(categories)}\n")
    print(f"  {'Category':<18} {'Count':>5}  {'Highest wattage appliance'}")
    print(f"  {_bar(60)}")
    for cat, apps in sorted(categories.items()):
        top = max(apps, key=lambda a: a['wattage_w'])
        print(f"  {cat:<18} {len(apps):>5}  {top['name']} ({top['wattage_w']}W)")

    print(f"\n  ✓ Database loaded successfully.")


# ── Test 2: Monthly usage breakdown ──────────────────────────────────────────

def test_usage_breakdown():
    print('\n' + '=' * W)
    print('  TEST 2 — Monthly Usage Breakdown (User\'s Appliances)')
    print('=' * W)
    print(f"\n  Predicted this month: {PREDICTED_UNITS} units  |  Rs {PREDICTED_BILL:,.0f}")
    print(f"\n  {'Appliance':<30} {'W':>5} {'Hrs':>4} {'Qty':>4} {'Units/mo':>9} {'% bill':>7}")
    print(f"  {_bar()}")

    total_u = 0
    for app in sorted(USER_APPLIANCES,
                      key=lambda a: appliance_monthly_units(a), reverse=True):
        u   = appliance_monthly_units(app)
        pct = u / PREDICTED_UNITS * 100
        total_u += u
        print(f"  {app['name']:<30} {app['wattage_w']:>5} {app['hours_per_day']:>4} "
              f"{app['quantity']:>4} {u:>9.1f} {pct:>6.1f}%")

    print(f"  {_bar()}")
    print(f"  {'TOTAL TRACKED':<30} {'':>5} {'':>4} {'':>4} {total_u:>9.1f} "
          f"{total_u/PREDICTED_UNITS*100:>6.1f}%")
    print(f"  {'PREDICTED (Module 1)':<45} {PREDICTED_UNITS:>9}")


# ── Test 3: Budget analysis + recommendations ─────────────────────────────────

def test_analyse():
    print('\n' + '=' * W)
    print('  TEST 3 — Budget Analysis & Recommendations')
    print('=' * W)

    BUDGET_PKR   = 9_000
    BUDGET_UNITS = 250

    result = analyse(
        appliances      = USER_APPLIANCES,
        predicted_units = PREDICTED_UNITS,
        predicted_bill  = PREDICTED_BILL,
        budget_pkr      = BUDGET_PKR,
        budget_units    = BUDGET_UNITS,
        bill_kwargs     = BILL_KWARGS,
    )

    print(f"\n  Predicted : {result['predicted_units']} units  |  Rs {result['predicted_bill']:,.0f}")
    print(f"  Budget    : {BUDGET_UNITS} units  |  Rs {BUDGET_PKR:,.0f}")
    print(f"  Gap       : {result['units_gap']} units  |  Rs {result['pkr_gap']:,.0f}")
    print(f"  Need to save : {result['units_to_save_for_pkr']} units to meet PKR budget")

    print(f"\n  Within PKR budget?   {'✓ YES' if result['within_pkr_budget']   else '✗ NO  — need reductions'}")
    print(f"  Within unit budget?  {'✓ YES' if result['within_units_budget']  else '✗ NO  — need reductions'}")

    print(f"\n  {'Rank':<5} {'Appliance':<30} {'Units/mo':>9} {'Saves/hr':>9} {'Rs/hr':>8}  {'Slab?':>6}")
    print(f"  {_bar()}")
    for i, app in enumerate(result['appliance_breakdown'], 1):
        slab = ' ⚡' if app['slab_at_1hr'] else ''
        print(f"  {i:<5} {app['name']:<30} {app['monthly_units']:>9.1f} "
              f"{app['savings_per_1hr']:>9.1f} {app['bill_drop_per_1hr']:>8,.0f}{slab}")
    print(f"\n  ⚡ = reducing this appliance by 1 hr crosses a tariff slab boundary (bonus saving)")

    return result


# ── Test 4: Apply user-chosen reductions ──────────────────────────────────────

def test_apply_reductions():
    print('\n' + '=' * W)
    print('  TEST 4 — User Applies Reductions')
    print('=' * W)

    # User decides to: cut AC by 3h, geyser by 0.5h, pump by 1h
    reductions = [
        {'name': 'Air Conditioner (1.5 ton)', 'hours_reduced': 3},
        {'name': 'Electric Geyser (large)',   'hours_reduced': 0.5},
        {'name': 'Water Pump (1 HP)',          'hours_reduced': 1},
    ]

    result = apply_reductions(
        appliances      = USER_APPLIANCES,
        reductions      = reductions,
        predicted_units = PREDICTED_UNITS,
        bill_kwargs     = BILL_KWARGS,
        budget_pkr      = 9_000,
        budget_units    = 250,
    )

    print(f"\n  Starting point : {result['original_units']} units  |  Rs {result['original_bill']:,.0f}")
    print(f"\n  {'Step':<3}  {'Appliance':<30} {'-Hrs':>5} {'-Units':>8} {'New Total':>10} {'New Bill':>10}")
    print(f"  {_bar()}")
    for i, step in enumerate(result['steps'], 1):
        print(f"  {i:<3}  {step['appliance']:<30} {step['hours_reduced']:>5.1f} "
              f"{step['units_saved']:>8.1f} {step['new_total_units']:>10} "
              f"  Rs {step['new_bill']:>8,.0f}")
        if step['slab_crossed']:
            print(f"       ⚡ {step['slab_bonus_msg']}")

    print(f"  {_bar()}")
    print(f"  {'FINAL':<34} {result['total_units_saved']:>8.1f} "
          f"{result['final_units']:>10}  Rs {result['final_bill']:>8,.0f}")
    print(f"\n  Total saved    : {result['total_units_saved']:.1f} units  |  Rs {result['total_pkr_saved']:,.0f}")
    print(f"  PKR budget met : {'✓ YES' if result['meets_pkr_budget']   else '✗ NO'}")
    print(f"  Unit budget met: {'✓ YES' if result['meets_units_budget'] else '✗ NO'}")

    return result


# ── Test 5: Auto-suggest to meet budget ───────────────────────────────────────

def test_auto_suggest():
    print('\n' + '=' * W)
    print('  TEST 5 — Auto-Suggest Reductions to Meet Budget')
    print('=' * W)

    BUDGET_PKR   = 9_000
    BUDGET_UNITS = 250

    suggestions = suggest_to_meet_budget(
        appliances      = USER_APPLIANCES,
        predicted_units = PREDICTED_UNITS,
        bill_kwargs     = BILL_KWARGS,
        budget_pkr      = BUDGET_PKR,
        budget_units    = BUDGET_UNITS,
    )

    print(f"\n  Target: ≤ {BUDGET_UNITS} units  |  ≤ Rs {BUDGET_PKR:,.0f}")
    print(f"  Starting: {PREDICTED_UNITS} units  |  Rs {PREDICTED_BILL:,.0f}\n")
    print(f"  {'#':<3} {'Appliance':<30} {'-Hrs/day':>9} {'-Units':>8} {'New Total':>10} {'New Bill':>10}")
    print(f"  {_bar()}")

    for i, s in enumerate(suggestions, 1):
        print(f"  {i:<3} {s['name']:<30} {s['hours_reduced']:>9.1f} "
              f"{s['units_saved']:>8.1f} {s['new_total_units']:>10}  Rs {s['new_bill']:>8,.0f}")

    if suggestions:
        final = suggestions[-1]
        met_pkr   = final['new_bill']         <= BUDGET_PKR
        met_units = final['new_total_units']  <= BUDGET_UNITS
        print(f"\n  Budget achievable? PKR {'✓' if met_pkr else '✗'}  |  Units {'✓' if met_units else '✗'}")
    else:
        print(f"\n  Already within budget — no reductions needed.")


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == '__main__':
    test_appliance_db()
    test_usage_breakdown()
    test_analyse()
    test_apply_reductions()
    test_auto_suggest()
    print('\n' + '=' * W)
    print('  All Module 4 tests complete.')
    print('=' * W + '\n')
