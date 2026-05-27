"""
LESCO Auto-Fetcher — Module 3.

Automates the full flow on lesco.gov.pk:
  1. Open CheckBill page, dismiss popup, fill reference number.
  2. Read and solve the 4-char alphanumeric CAPTCHA with EasyOCR.
  3. Submit CAPTCHA → click "Consumption & Payment History".
  4. Parse the 12-month history table.
  5. Return structured data ready for Module 1 (predictor).

Retry logic
-----------
The CAPTCHA is attempted up to MAX_CAPTCHA_RETRIES times.
On each retry the CAPTCHA image auto-refreshes (new server-side image).
If all retries fail a FetchError is raised with a descriptive message.
"""

import re
import time
from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout

from captcha_solver import solve as solve_captcha
from parser import parse_history_html, to_predictor_input


# ── Constants ────────────────────────────────────────────────────────────────

BASE_URL         = 'https://www.lesco.gov.pk:36269/Modules/CustomerBillN/CheckBill.asp'
MAX_CAPTCHA_RETRIES = 6
PAGE_TIMEOUT_MS     = 20_000
NAV_TIMEOUT_MS      = 25_000


class FetchError(Exception):
    pass


# ── Helpers ───────────────────────────────────────────────────────────────────

def _split_ref(ref_no: str) -> tuple[str, str, str, str]:
    """
    '08 11274 1172000U'  →  ('08', '11274', '1172000', 'U')
    Accepts with or without spaces.
    """
    clean = re.sub(r'\s', '', ref_no).upper()
    if len(clean) != 15:
        raise FetchError(f"Invalid reference number length: {ref_no!r}  (expected 15 alphanumeric chars)")
    return clean[0:2], clean[2:7], clean[7:14], clean[14]


def _dismiss_popup(page) -> None:
    """Hide any overlay/popup that blocks the submit button."""
    page.evaluate("""() => {
        ['#popup', '.popup-container', '.modal', '.overlay', '.popup'].forEach(sel => {
            document.querySelectorAll(sel).forEach(el => el.style.display = 'none');
        });
    }""")


def _is_on_history_page(page) -> bool:
    """Detect whether we successfully reached the history table."""
    try:
        content = page.content().upper()
        return 'BILLED UNITS' in content or 'CONSUMPTION' in content and 'PAYMENT HISTORY' in content
    except Exception:
        return False


def _is_captcha_wrong(page) -> bool:
    """Detect a wrong-CAPTCHA error response."""
    try:
        content = page.content().upper()
        return ('INVALID' in content or 'WRONG' in content or
                'INCORRECT' in content or 'TRY AGAIN' in content)
    except Exception:
        return False


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
    save_screenshot  : Optional file path to save a screenshot of the history page
    verbose          : Print progress to stdout

    Returns
    -------
    dict from parser.to_predictor_input() — ready for Module 1 predict()
    Raises FetchError on unrecoverable errors.
    """
    batch, subdiv, refno, ru = _split_ref(ref_no)

    def log(msg):
        if verbose:
            print(f"[Fetcher] {msg}")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=headless)
        context = browser.new_context(
            user_agent=(
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
                'AppleWebKit/537.36 (KHTML, like Gecko) '
                'Chrome/124.0.0.0 Safari/537.36'
            ),
            viewport={'width': 1280, 'height': 800},
        )
        page = context.new_page()

        try:
            # ── Step 1: Load CheckBill page ───────────────────────────────────
            log(f"Navigating to LESCO CheckBill page…")
            page.goto(BASE_URL, timeout=NAV_TIMEOUT_MS, wait_until='domcontentloaded')
            _dismiss_popup(page)
            log(f"Page loaded: {page.url}")

            # ── Step 2: Fill reference number ─────────────────────────────────
            page.fill('input[name="txtBatchNo"]', batch)
            page.fill('input[name="txtSubDiv"]',  subdiv)
            page.fill('input[name="txtRefNo"]',   refno)
            page.select_option('select[name="cmbRU"]', ru)
            log(f"Ref no entered: {batch} {subdiv} {refno}{ru}")

            # Click via JS to bypass any lingering overlay
            page.evaluate('document.querySelector(\'input[name="btnViewMenu"]\').click()')
            page.wait_for_load_state('domcontentloaded', timeout=NAV_TIMEOUT_MS)
            log("Navigated to Customer Account Menu (CAPTCHA page).")

            # ── Step 3: CAPTCHA loop ──────────────────────────────────────────
            captcha_attempts = 0
            while captcha_attempts < MAX_CAPTCHA_RETRIES:
                captcha_attempts += 1
                log(f"CAPTCHA attempt {captcha_attempts}/{MAX_CAPTCHA_RETRIES}…")

                # Screenshot just the CAPTCHA image element
                try:
                    captcha_el = page.locator('img[src*="codeimage"]').first
                    captcha_el.wait_for(timeout=PAGE_TIMEOUT_MS)
                    captcha_bytes = captcha_el.screenshot()
                except PWTimeout:
                    raise FetchError("CAPTCHA image not found on page — ref no may be invalid.")

                # Solve
                result = solve_captcha(captcha_bytes)
                code   = result['code']
                log(f"  CAPTCHA solved: {code!r}  (confidence {result['confidence']:.0%}, success={result['success']})")
                if verbose and not result['success']:
                    log(f"  Low-confidence variants: {result['all_results'][:4]}")

                # Enter code
                page.fill('input[name="code"]', code)

                # Click "Consumption & Payment History"
                hist_btn = page.locator('button[name="submit_param"]', has_text='Consumption')
                hist_btn.click(timeout=PAGE_TIMEOUT_MS)
                page.wait_for_load_state('domcontentloaded', timeout=NAV_TIMEOUT_MS)

                if _is_on_history_page(page):
                    log("✓ History page loaded.")
                    break

                if _is_captcha_wrong(page):
                    log(f"  ✗ Wrong CAPTCHA, retrying…")
                    # Go back to retry with a fresh CAPTCHA
                    page.go_back()
                    page.wait_for_load_state('domcontentloaded', timeout=NAV_TIMEOUT_MS)
                    continue

                # Unexpected state — try going back once
                log(f"  Unexpected page state, going back…")
                page.go_back()
                page.wait_for_load_state('domcontentloaded', timeout=NAV_TIMEOUT_MS)

            else:
                raise FetchError(
                    f"CAPTCHA failed after {MAX_CAPTCHA_RETRIES} attempts. "
                    "The CAPTCHA solver may need tuning, or the website layout has changed."
                )

            # ── Step 4: Parse history table ───────────────────────────────────
            html = page.content()

            if save_screenshot:
                page.screenshot(path=save_screenshot, full_page=True)
                log(f"Screenshot saved: {save_screenshot}")

            rows = parse_history_html(html)
            if not rows:
                raise FetchError(
                    "History page loaded but no data rows found. "
                    "The page structure may have changed — check save_screenshot output."
                )

            log(f"Parsed {len(rows)} months of history.")
            result = to_predictor_input(rows)

            # Print summary
            if verbose:
                log("─" * 50)
                log(f"{'Month':<12} {'Units':>6}  {'Bill (Rs)':>10}")
                log("─" * 50)
                for r in result['raw_rows']:
                    log(f"  {r['month']:<10} {r['units']:>6,}  {r['bill']:>10,}")
                log("─" * 50)

            return result

        except FetchError:
            raise
        except PWTimeout as e:
            raise FetchError(f"Browser timeout: {e}") from e
        except Exception as e:
            raise FetchError(f"Unexpected error: {type(e).__name__}: {e}") from e
        finally:
            browser.close()
