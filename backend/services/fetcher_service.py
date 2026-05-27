"""
Bridge to module_3_fetcher/fetcher.py.
"""

import logging

logger = logging.getLogger(__name__)


def fetch_lesco_history(ref_no: str, headless: bool = True, verbose: bool = False) -> dict:
    """
    Fetch 12-month consumption history from the LESCO portal.

    Returns
    -------
    dict with keys: history_units, history_bills, history_months,
                    latest_month, latest_units, latest_bill, raw_rows

    Raises FetchError on failure.
    """
    try:
        from fetcher import fetch, FetchError  # module_3_fetcher/fetcher.py

        result = fetch(ref_no=ref_no, headless=headless, verbose=verbose)
        return result
    except ImportError:
        logger.error("Fetcher module not found. Check FETCHER_MODULE_PATH in settings.")
        raise
