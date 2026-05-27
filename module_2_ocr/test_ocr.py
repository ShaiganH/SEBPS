"""
Tests for Module 2 — OCR Reference Number Extractor.

Run modes:
  python3 test_ocr.py                     → regex unit tests only (no image needed)
  python3 test_ocr.py path/to/bill.jpg    → full OCR test on a real bill image
"""

import sys
import time
from ref_extractor import extract_reference_number, _search_text, _normalize


# ── Unit tests (no image required) ───────────────────────────────────────────

REGEX_CASES = [
    # (description, input_text, expected_ref_no)

    # Canonical formats from real bills
    ('With spaces',               'REF NO : 08 11274 1172000U',           '08 11274 1172000U'),
    ('With spaces (second bill)', 'reference number 10 11219 1154800U',   '10 11219 1154800U'),

    # OCR noise variants
    ('No spaces',                 'ref no 0811274 1172000U rest',          '08 11274 1172000U'),
    ('Double spaces',             'REF NO :  08  11274  1172000U',         '08 11274 1172000U'),
    ('Hyphen separator',          'ref no 08-11274-1172000U',              '08 11274 1172000U'),
    ('Extra text around',         'ACCOUNT 08 11274 1172000U JOHAR TOWN', '08 11274 1172000U'),
    ('O→0 OCR noise',             'REF NO : O8 11274 117200OU',           '08 11274 1172000U'),  # O misread as 0
    ('Lowercase letter suffix',   'ref no 08 11274 1172000u',             '08 11274 1172000U'),

    # Should NOT match
    ('Too short',                 'REF NO : 08 11274 11720',              None),
    ('No letter suffix',          'REF NO : 08 11274 11720001',           None),
]


def run_unit_tests():
    print('\n' + '='*66)
    print('  REGEX / NORMALIZATION UNIT TESTS  (no image required)')
    print('='*66)

    passed = failed = 0
    for desc, text, expected in REGEX_CASES:
        result = _search_text(text)
        ok     = (result == expected)
        icon   = '✓' if ok else '✗'
        if ok:
            passed += 1
        else:
            failed += 1
        status = f"got '{result}'" if not ok else ''
        print(f"  {icon}  {desc:<36}  →  {str(result):<22}  {status}")

    print(f"\n  {passed}/{passed+failed} tests passed", '✓' if failed == 0 else '← FAILURES ABOVE')
    print('='*66)
    return failed == 0


# ── Full image test ───────────────────────────────────────────────────────────

def run_image_test(image_path: str, expected_ref: str = None):
    print(f'\n' + '='*66)
    print(f'  IMAGE OCR TEST')
    print(f'  File : {image_path}')
    if expected_ref:
        print(f'  Expected: {expected_ref}')
    print('='*66)

    t0     = time.time()
    result = extract_reference_number(image_path)
    elapsed = time.time() - t0

    if result['success']:
        print(f"\n  ✓  Reference No : {result['ref_no']}")
        print(f"     Confidence   : {result['confidence']:.0%}")
        print(f"     Method       : {result['method']}")
        print(f"     Time         : {elapsed:.1f}s")

        if result['all_hits']:
            counts: dict = {}
            for r in result['all_hits']:
                counts[r] = counts.get(r, 0) + 1
            print(f"\n  Votes across preprocessing variants:")
            for ref, cnt in sorted(counts.items(), key=lambda x: -x[1]):
                marker = '  ← selected' if ref == result['ref_no'] else ''
                print(f"    {ref}  ×{cnt}{marker}")

        if expected_ref:
            match = result['ref_no'] == expected_ref
            print(f"\n  Accuracy check: {'✓ CORRECT' if match else f'✗ WRONG  (expected {expected_ref})'}")
    else:
        print(f"\n  ✗  Extraction failed")
        print(f"     {result['message']}")
        print(f"\n  Raw OCR text sample (first 10 lines):")
        for line in result['raw_ocr'][:10]:
            print(f"    {line}")

    print('='*66)
    return result


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == '__main__':
    all_ok = run_unit_tests()

    if len(sys.argv) >= 2:
        image_path   = sys.argv[1]
        expected_ref = sys.argv[2] if len(sys.argv) >= 3 else None
        run_image_test(image_path, expected_ref)
    else:
        print('\n  Tip: pass a bill image path to run full OCR test:')
        print('       python3 test_ocr.py path/to/bill.jpg [expected_ref_no]')
        print()
        print('  Example:')
        print('       python3 test_ocr.py bill.jpg "08 11274 1172000U"')
