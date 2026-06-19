"""
End-to-end test for Module 3 — LESCO Auto-Fetcher.

Run modes
---------
python3 test_fetcher.py                          → parser unit test only (no network)
python3 test_fetcher.py live                     → full live fetch (default ref no)
python3 test_fetcher.py live 10 11219 1154800U   → full live fetch with custom ref no
"""

import sys

# ── 1. Parser unit test (no network, no browser) ─────────────────────────────

SAMPLE_HTML = """
<html><body>
<h1>CONSUMPTION &amp; PAYMENT HISTORY</h1>
<h3>REF NO : 10 11219 1154800U</h3>
<table>
  <tr><th>MONTH</th><th>BILLED UNITS</th><th>BILL</th><th>PAYMENT</th></tr>
  <tr><td>Apr-25</td><td>260</td><td>10556</td><td>10556</td></tr>
  <tr><td>May-25</td><td>239</td><td>9063</td><td>9063</td></tr>
  <tr><td>Jun-25</td><td>284</td><td>10998</td><td>10998</td></tr>
  <tr><td>Jul-25</td><td>253</td><td>10183</td><td>10183</td></tr>
  <tr><td>Aug-25</td><td>292</td><td>11798</td><td>11798</td></tr>
  <tr><td>Sep-25</td><td>242</td><td>9428</td><td>9428</td></tr>
  <tr><td>Oct-25</td><td>207</td><td>8555</td><td>8555</td></tr>
  <tr><td>Nov-25</td><td>144</td><td>5301</td><td>5301</td></tr>
  <tr><td>Dec-25</td><td>157</td><td>5861</td><td>5861</td></tr>
  <tr><td>Jan-26</td><td>160</td><td>6052</td><td>6052</td></tr>
  <tr><td>Feb-26</td><td>192</td><td>7761</td><td>7761</td></tr>
  <tr><td>Mar-26</td><td>238</td><td>11580</td><td>11580</td></tr>
</table>
</body></html>
"""

EXPECTED_UNITS = [260, 239, 284, 253, 292, 242, 207, 144, 157, 160, 192, 238]
EXPECTED_BILLS = [10556, 9063, 10998, 10183, 11798, 9428, 8555, 5301, 5861, 6052, 7761, 11580]


def test_parser():
    from parser import parse_history_html, to_predictor_input

    print('\n' + '='*62)
    print('  PARSER UNIT TEST  (no network required)')
    print('='*62)

    rows   = parse_history_html(SAMPLE_HTML)
    result = to_predictor_input(rows)

    passed = failed = 0

    checks = [
        ('Row count == 12',           len(rows) == 12),
        ('Units list matches',        result['history_units'] == EXPECTED_UNITS),
        ('Bills list matches',        result['history_bills'] == EXPECTED_BILLS),
        ('Latest month == Mar-26',    result['latest_month'] == 'Mar-26'),
        ('Latest units == 238',       result['latest_units'] == 238),
        ('Latest bill == 11580',      result['latest_bill'] == 11580),
        ('Months sorted oldest first', rows[0]['month'] == 'Apr-25'),
    ]

    for desc, ok in checks:
        icon = '✓' if ok else '✗'
        print(f"  {icon}  {desc}")
        if ok:
            passed += 1
        else:
            failed += 1

    print(f"\n  {passed}/{passed+failed} checks passed", '✓' if failed == 0 else '← FAILURES')
    print('='*62)
    return failed == 0


# ── 2. Live end-to-end fetch ───────────────────────────────────────────────

def test_live_fetch(ref_no: str = '10 11219 1154800U'):
    from fetcher import fetch, FetchError
    import os, sys
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'module_1_predictor'))

    print(f'\n' + '='*62)
    print(f'  LIVE FETCH TEST  —  Ref: {ref_no}')
    print('='*62)

    screenshot_path = f'history_screenshot_{ref_no.replace(" ", "_")}.png'

    try:
        data = fetch(ref_no, headless=True, save_screenshot=screenshot_path, verbose=True)

        print(f"\n  ── Predictor-ready output ──────────────────────────────")
        print(f"  history_units  : {data['history_units']}")
        print(f"  history_months : {data['history_months']}")
        print(f"  latest_month   : {data['latest_month']}")
        print(f"  latest_units   : {data['latest_units']}")

        # Wire directly into Module 1
        try:
            from predictor import predict
            import numpy as np
            daily_avg = np.mean(data['history_units']) / 30
            result = predict(
                history_units  = data['history_units'],
                units_so_far   = int(daily_avg * 15),
                days_elapsed   = 15,
                total_cycle_days = 30,
            )
            pred = result['prediction']
            print(f"\n  ── Module 1 prediction (mid-cycle) ────────────────────")
            print(f"  Predicted units : {pred['units']}")
            print(f"  Estimated bill  : Rs {pred['bill']['total_payable']:,.0f}")
            print(f"  Source          : {result['confidence']['primary_source']}")
        except ImportError:
            print("\n  (Module 1 not in path — skipping prediction step)")

        print('='*62)
        return data

    except FetchError as e:
        print(f"\n  ✗ FetchError: {e}")
        print('='*62)
        return None


# ── Entry point ────────────────────────────────────────────────────────────

if __name__ == '__main__':
    args = sys.argv[1:]

    if not args or args[0] == 'parser':
        test_parser()

    elif args[0] == 'live':
        ref = ' '.join(args[1:]) if len(args) > 1 else '10 11219 1154800U'
        test_parser()          # always run unit tests first
        test_live_fetch(ref)

    else:
        # Treat all args as ref no
        ref = ' '.join(args)
        test_parser()
        test_live_fetch(ref)
