"""
Parse the LESCO "Consumption & Payment History" HTML page.

The page renders a table with columns: MONTH | BILLED UNITS | BILL | PAYMENT
Returns a list of dicts ready to feed into Module 1 (predictor).
"""

import re
from bs4 import BeautifulSoup


# Month name → index mapping for sorting
_MONTH_ORDER = {
    'jan': 1, 'feb': 2, 'mar': 3, 'apr': 4,
    'may': 5, 'jun': 6, 'jul': 7, 'aug': 8,
    'sep': 9, 'oct': 10, 'nov': 11, 'dec': 12,
}


def _parse_month(text: str) -> tuple[int, int] | None:
    """
    Parse 'Apr-25' → (2025, 4).  Returns None if unparseable.
    Handles both 2-digit and 4-digit year suffixes.
    """
    m = re.match(r'([A-Za-z]{3})[\-\s](\d{2,4})', text.strip())
    if not m:
        return None
    mon_str = m.group(1).lower()
    yr_str  = m.group(2)
    mon_idx = _MONTH_ORDER.get(mon_str)
    if mon_idx is None:
        return None
    year = int(yr_str)
    if year < 100:
        year += 2000
    return (year, mon_idx)


def _clean_int(text: str) -> int | None:
    """Extract an integer from a cell that may contain commas or whitespace."""
    digits = re.sub(r'[,\s]', '', text.strip())
    try:
        return int(digits)
    except ValueError:
        return None


def parse_history_html(html: str) -> list[dict]:
    """
    Parse the raw HTML of the LESCO history page.

    Returns
    -------
    list of dicts (sorted oldest → newest):
        month   : str   — e.g. 'Apr-25'
        year    : int   — e.g. 2025
        mon_idx : int   — 1-12
        units   : int   — billed units
        bill    : int   — bill amount (PKR)
        payment : int | None
    """
    soup  = BeautifulSoup(html, 'html.parser')
    rows  = []

    # Find all tables and look for one that has month-like data
    for table in soup.find_all('table'):
        cells_text = [td.get_text(strip=True) for td in table.find_all('td')]

        # Heuristic: this is the history table if it contains month-like strings
        month_like = [c for c in cells_text if re.match(r'[A-Za-z]{3}[\-\s]\d{2}', c)]
        if len(month_like) < 3:
            continue

        trs = table.find_all('tr')
        for tr in trs:
            tds = tr.find_all('td')
            if len(tds) < 3:
                continue

            month_text = tds[0].get_text(strip=True)
            parsed     = _parse_month(month_text)
            if not parsed:
                continue

            year, mon_idx = parsed
            units   = _clean_int(tds[1].get_text())
            bill    = _clean_int(tds[2].get_text())
            payment = _clean_int(tds[3].get_text()) if len(tds) > 3 else None

            if units is None or bill is None:
                continue

            rows.append({
                'month':   month_text,
                'year':    year,
                'mon_idx': mon_idx,
                'units':   units,
                'bill':    bill,
                'payment': payment,
            })

    # Sort chronologically (oldest first) and deduplicate
    rows.sort(key=lambda r: (r['year'], r['mon_idx']))
    seen:  set[tuple] = set()
    unique = []
    for r in rows:
        key = (r['year'], r['mon_idx'])
        if key not in seen:
            seen.add(key)
            unique.append(r)

    return unique


def to_predictor_input(rows: list[dict]) -> dict:
    """
    Convert parsed history rows into the exact format expected by Module 1.

    Returns
    -------
    dict
        history_units  : list[int]  — monthly units, oldest first (up to 12)
        history_bills  : list[int]  — monthly bills, oldest first
        history_months : list[str]  — month labels
        latest_month   : str
        latest_units   : int
        latest_bill    : int
    """
    # Keep only the last 12 months
    recent = rows[-12:]
    return {
        'history_units':  [r['units'] for r in recent],
        'history_bills':  [r['bill']  for r in recent],
        'history_months': [r['month'] for r in recent],
        'latest_month':   recent[-1]['month'] if recent else '',
        'latest_units':   recent[-1]['units'] if recent else 0,
        'latest_bill':    recent[-1]['bill']  if recent else 0,
        'raw_rows':       recent,
    }
