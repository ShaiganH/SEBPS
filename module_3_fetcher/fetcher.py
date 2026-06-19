"""
LESCO Bill Fetcher — Module 3 (v2).

Uses lescoebillcheck.pk — a third-party portal with no CAPTCHA.
Flow:
  1. Navigate to lescoebillcheck.pk
  2. Enter reference number (no spaces, no trailing 'U')
  3. Submit → parse the returned bill history table
  4. Return structured data ready for Module 1 (predictor)

Proxy support
-------------
Set LESCO_PROXY=http://host:port in backend/.env if the host machine's
IP is blocked by the site (e.g. AWS US datacenter IPs).
"""

import re
import os
from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout

from parser import parse_history_html, to_predictor_input


# ── Constants ────────────────────────────────────────────────────────────────

BASE_URL        = 'https://lescoebillcheck.pk/'
NAV_TIMEOUT_MS  = 60_000   # 60 s — allow for slow connections through proxy
PAGE_TIMEOUT_MS = 40_000


class FetchError(Exception):
    pass


# ── Helpers ───────────────────────────────────────────────────────────────────

def _format_ref(ref_no: str) -> str:
    """
    Format reference number for lescoebillcheck.pk:
      - Remove all spaces
      - Strip trailing 'U' (the site does not want it)

    Examples
    --------
    '08 11274 1172000U' -> '08112741172000'
    '10 11219 1154800'  -> '10112191154800'
    """
    clean = re.sub(r'\s', '', ref_no).upper()
    if clean.endswith('U'):
        clean = clean[:-1]
    return clean


# Exact selectors confirmed by live inspection of lescoebillcheck.pk
REF_INPUT_SELECTOR    = 'input[name="reference_no"]'
SUBMIT_BTN_SELECTOR   = 'input[type="submit"]'


# ── Main fetcher ──────────────────────────────────────────────────────────────

def fetch(
    ref_no: str,
    headless: bool = True,
    save_screenshot: str | None = None,
    verbose: bool = True,
) -> dict:
    """
    Fetch 12-month consumption & payment history for a LESCO customer.

    Parameters
    ----------
    ref_no           : LESCO reference number e.g. '08 11274 1172000U'
    headless         : Run browser in background (True) or visible (False for debugging)
    save_screenshot  : Optional file path to save a screenshot of the result page
    verbose          : Print progress to stdout

    Returns
    -------
    dict from parser.to_predictor_input() -- ready for Module 1 predict()
    Raises FetchError on unrecoverable errors.
    """
    formatted_ref = _format_ref(ref_no)

    def log(msg):
        if verbose:
            print(f"[Fetcher] {msg}")

    # Optional proxy -- set LESCO_PROXY=http://host:port in backend/.env
    # Useful if EC2's US-east IP is blocked by the site.
    proxy_server = os.environ.get('LESCO_PROXY', '').strip() or None
    launch_kwargs = {'headless': headless}
    if proxy_server:
        launch_kwargs['proxy'] = {'server': proxy_server}
        log(f"Using proxy: {proxy_server}")

    with sync_playwright() as p:
        browser = p.chromium.launch(**launch_kwargs)
        context = browser.new_context(
            user_agent=(
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
                'AppleWebKit/537.36 (KHTML, like Gecko) '
                'Chrome/124.0.0.0 Safari/537.36'
            ),
            viewport={'width': 1280, 'height': 900},
        )
        page = context.new_page()

        try:
            # ── Step 1: Load the site ─────────────────────────────────────────
            log(f"Navigating to {BASE_URL} ...")
            page.goto(BASE_URL, timeout=NAV_TIMEOUT_MS, wait_until='domcontentloaded')
            log(f"Page loaded: {page.url}")

            # ── Step 2: Fill the reference number ────────────────────────────
            page.fill(REF_INPUT_SELECTOR, formatted_ref, timeout=PAGE_TIMEOUT_MS)
            log(f"Entered reference: {formatted_ref}")

            # ── Step 3: Submit ────────────────────────────────────────────────
            # The form has target="_blank" — the result (served by PITC, the
            # site's actual bill backend) opens in a new tab, not in `page`.
            try:
                with context.expect_page(timeout=PAGE_TIMEOUT_MS) as popup_info:
                    page.click(SUBMIT_BTN_SELECTOR, timeout=PAGE_TIMEOUT_MS)
                result_page = popup_info.value
            except PWTimeout as e:
                raise FetchError(
                    f"Submitting the form did not open the result tab: {e}"
                ) from e
            log("Submitted form, result tab opened.")

            # ── Step 4: Wait for result ───────────────────────────────────────
            result_page.wait_for_load_state('domcontentloaded', timeout=NAV_TIMEOUT_MS)
            log(f"Result page loaded: {result_page.url}")

            if save_screenshot:
                result_page.screenshot(path=save_screenshot, full_page=True)
                log(f"Screenshot saved: {save_screenshot}")

            # ── Step 5: Parse the history table from the page HTML ────────────
            html = result_page.content()
            rows = parse_history_html(html)

            if not rows:
                # Wait a few seconds — the page shows a loading bar before the
                # bill table renders.
                log("No rows found immediately — waiting 3 s for dynamic content...")
                result_page.wait_for_timeout(3000)
                html = result_page.content()
                rows = parse_history_html(html)

            if not rows:
                raise FetchError(
                    "No history rows found in the result. "
                    "The reference number may be invalid, or the page structure changed. "
                    "Set save_screenshot='/tmp/debug.png' and inspect the result."
                )

            log(f"Parsed {len(rows)} months of history.")
            result = to_predictor_input(rows)

            if verbose:
                log("-" * 50)
                log(f"{'Month':<12} {'Units':>6}  {'Bill (Rs)':>10}")
                log("-" * 50)
                for r in result['raw_rows']:
                    log(f"  {r['month']:<10} {r['units']:>6,}  {r['bill']:>10,}")
                log("-" * 50)

            return result

        except FetchError:
            raise
        except PWTimeout as e:
            raise FetchError(f"Browser timeout: {e}") from e
        except Exception as e:
            raise FetchError(f"Unexpected error: {type(e).__name__}: {e}") from e
        finally:
            browser.close()
