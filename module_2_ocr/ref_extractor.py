"""
LESCO Reference Number extractor.

Reference number format (confirmed from two real bills):
    XX XXXXX XXXXXXXL
    ── ───── ───────┘
    2   5       7    1 uppercase letter
    e.g.  08 11274 1172000U
          10 11219 1154800U

Total alphanumeric length: 15 characters.

Extraction strategy (in order of priority):
  1. Context-guided  : find "REF NO" / "REFERENCE" label in OCR text,
                       extract the number immediately after it.
  2. Full-text regex : scan all OCR output for the 15-char pattern.
  3. Voting          : run on 8 preprocessing variants; most-agreed candidate wins.
  4. Fallback        : return None with a user-friendly prompt.
"""

import re
from collections import Counter
from typing import Optional

from preprocess import get_variants
from ocr_engine import run_ocr, run_ocr_easyocr_fallback

# ── Pattern definitions ───────────────────────────────────────────────────────
#
# LESCO ref: 2 digits + 5 digits + 7 digits + 1 uppercase letter = 15 alnum chars.
# e.g.  08 11274 1172000U  /  10 11219 1154802U
#
# IMPORTANT: The "REFERENCE NO" table cell on the printed/web bill often shows
# only the 14 digits (e.g. "08 11274 1169800") — the trailing letter (U, K, etc.)
# is omitted or only appears in the barcode strip at the bottom.  All patterns
# below make the trailing letter OPTIONAL so we still extract a valid ref.
# _normalize() handles both 14-digit and 15-char forms.
#
# Patterns listed most-specific → least-specific.
_PAT_SPACED    = re.compile(r'\b(\d{2})\s+(\d{5})\s+(\d{7}[A-Z]?)\b')
_PAT_LOOSE     = re.compile(r'(\d{2})[\s\-\.]+(\d{5})[\s\-\.]+(\d{7}[A-Z]?)')
_PAT_SPLIT_7_8 = re.compile(r'\b(\d{7})[\s\-\.]+(\d{7}[A-Z]?)\b')  # OCR merges first two groups
_PAT_NOSPACE   = re.compile(r'\b(\d{2})(\d{5})(\d{7}[A-Z]?)\b')
_PAT_COMBINED  = re.compile(r'\b(\d{14}[A-Z]?)\b')                  # fully merged

_ALL_PATTERNS = [_PAT_SPACED, _PAT_LOOSE, _PAT_SPLIT_7_8, _PAT_NOSPACE, _PAT_COMBINED]

# Text near which the ref number appears on LESCO bills
_CONTEXT_KEYS = [
    'ref no', 'reference no', 'reference number',
    'ref number', 'ref.no', 'ref:', 'refno',
]

# Common OCR misreads: O→0, l/I→1
_OCR_FIXES = str.maketrans({'O': '0', 'o': '0', 'l': '1', 'I': '1'})


# ── Helpers ───────────────────────────────────────────────────────────────────

def _fix_ocr_noise(s: str) -> str:
    """Apply known OCR substitutions to the digit portion only (keep final letter)."""
    if not s:
        return s
    digits = s[:-1].translate(_OCR_FIXES)
    letter = s[-1].upper()
    return digits + letter


def _normalize(raw: str) -> Optional[str]:
    """
    Convert any matched raw string into canonical form.

    Accepts both:
      • 15-char  XX XXXXX XXXXXXXL  (full ref with trailing letter)
      • 14-digit XX XXXXX XXXXXXX   (ref as printed in the table cell — letter omitted)

    The 14-digit form is returned WITHOUT a trailing letter; the fetcher strips
    any trailing letter anyway before querying lescoebillcheck.pk, so either
    form works.
    """
    stripped = re.sub(r'[\s\-\.]', '', raw).upper()

    # Apply noise fixes to digit portion only
    if len(stripped) >= 1:
        digit_end = 14 if len(stripped) >= 14 else len(stripped)
        stripped = stripped[:digit_end].translate(_OCR_FIXES) + stripped[digit_end:]

    # Full 15-char ref: 14 digits + 1 letter
    if len(stripped) == 15 and stripped[:14].isdigit() and stripped[-1].isalpha():
        return f"{stripped[:2]} {stripped[2:7]} {stripped[7:]}"

    # 14-digit ref (trailing letter not captured by OCR — common in bill table)
    if len(stripped) == 14 and stripped.isdigit():
        return f"{stripped[:2]} {stripped[2:7]} {stripped[7:]}"

    return None


def _clean_for_matching(text: str) -> str:
    """
    Apply OCR character fixes to the whole snippet before pattern matching.
    Only fixes characters in positions where digits are expected — we replace
    uppercase O with 0 and I/l with 1 globally here because the ref number
    contains only digits and one trailing letter; false fixes in surrounding
    prose don't affect us since we only keep the 15-char match.
    """
    return text.replace('O', '0').replace('o', '0').replace('I', '1').replace('l', '1')


def _search_text(text: str) -> Optional[str]:
    """
    Search a single OCR text string for a LESCO reference number.
    Tries context-guided first, then full pattern scan.
    OCR noise corrections (O→0, I→1) are applied before matching.
    """
    text_up    = text.upper()
    text_fixed = _clean_for_matching(text_up)   # noise-corrected copy for digit matching

    # 1. Context-guided — look in the 80 chars after a known label
    for kw in _CONTEXT_KEYS:
        idx = text_up.find(kw.upper())
        if idx == -1:
            continue
        snippet_fixed = text_fixed[idx: idx + 80]
        for pat in _ALL_PATTERNS:
            m = pat.search(snippet_fixed)
            if m:
                candidate = _normalize(m.group(0))
                if candidate:
                    return candidate

    # 2. Full-text scan on noise-corrected text
    for pat in _ALL_PATTERNS:
        for m in pat.finditer(text_fixed):
            candidate = _normalize(m.group(0))
            if candidate:
                return candidate

    return None


def _search_lines(lines: list[str]) -> Optional[str]:
    """
    Search a list of OCR output lines.
    Also checks the line *after* a label line (common layout in LESCO bills).
    """
    # Search each line on its own
    for line in lines:
        hit = _search_text(line)
        if hit:
            return hit

    # Check line-after-label: "REF NO :\n08 11274 1172000U"
    lower_lines = [ln.lower() for ln in lines]
    for i, ln in enumerate(lower_lines):
        if any(kw in ln for kw in _CONTEXT_KEYS) and i + 1 < len(lines):
            hit = _search_text(lines[i + 1])
            if hit:
                return hit

    # Last resort: join everything and try once more
    joined = ' '.join(lines)
    return _search_text(joined)


# ── Public API ────────────────────────────────────────────────────────────────

def extract_reference_number(
    image_source,
    early_exit_votes: int = 2,
) -> dict:
    """
    Extract a LESCO reference number from a bill image.

    Variants are processed sequentially in order (header crops first, then full
    image).  Stops as soon as `early_exit_votes` variants agree on the same
    candidate — on a clear photo this triggers after just 3 header-crop calls
    (~3 s) without needing to process the remaining variants.

    Parameters
    ----------
    image_source      : str (file path), PIL Image, or bytes
    early_exit_votes  : stop once this many variants return the same ref no (default 3)

    Returns
    -------
    dict
        success      : bool
        ref_no       : str | None   — canonical 'XX XXXXX XXXXXXXL' or None
        confidence   : float        — fraction of preprocessing variants that agreed
        method       : str | None   — which preprocessing variant found the number
        all_hits     : list[str]    — all candidates found (for debugging)
        variants_run : int          — how many variants were actually processed
        message      : str          — shown to user
    """
    variants = get_variants(image_source)
    n = len(variants)

    hit_log:      list[tuple[str, str]] = []   # (ref_no, variant_name)
    all_raw_text: list[str]             = []
    variants_run: int                   = 0

    # ── Phase 1: Tesseract across all preprocessing variants (~0.5 s each) ──────
    for variant_name, img in variants:
        lines = run_ocr(img)       # Tesseract-only, fast
        variants_run += 1
        all_raw_text.extend(lines)

        ref = _search_lines(lines)
        if ref:
            hit_log.append((ref, variant_name))

        # Early exit once enough variants agree
        if hit_log:
            vote = Counter(r for r, _ in hit_log)
            if vote.most_common(1)[0][1] >= early_exit_votes:
                break

    # ── Phase 2: EasyOCR fallback — only if Tesseract found nothing ─────────────
    # Runs EasyOCR once on just the full grayscale image (~10–15 s).
    # Handles blurry/phone-screen photos that confuse Tesseract.
    if not hit_log:
        print("[OCR] Tesseract found nothing — trying EasyOCR fallback on full image…")
        import cv2, numpy as np
        from preprocess import _to_gray, load_image
        img_full = load_image(image_source)
        from preprocess import _cap_size
        img_full = _cap_size(img_full)
        gray_full = _to_gray(img_full)
        easy_lines = run_ocr_easyocr_fallback(gray_full)
        variants_run += 1
        all_raw_text.extend(easy_lines)
        ref = _search_lines(easy_lines)
        if ref:
            hit_log.append((ref, 'easyocr_fallback'))

    if not hit_log:
        return {
            'success':      False,
            'ref_no':       None,
            'confidence':   0.0,
            'method':       None,
            'all_hits':     [],
            'raw_ocr':      all_raw_text,
            'variants_run': variants_run,
            'message': (
                "Could not extract the reference number from this image.\n"
                "Tips:\n"
                "  • Photograph the printed paper bill — not a phone/screen display.\n"
                "    Screen photos contain status-bar and browser text that confuses OCR.\n"
                "  • Make sure the bill is flat and well-lit with no glare.\n"
                "  • Ensure the 'REF NO' section is fully visible and in focus.\n"
                "  • Try a closer crop around the reference number.\n"
                "Or enter the reference number manually."
            ),
        }

    # Vote: most-agreed candidate across all preprocessing variants
    vote = Counter(ref for ref, _ in hit_log)
    best_ref, count = vote.most_common(1)[0]
    confidence = count / n
    first_method = next(m for r, m in hit_log if r == best_ref)

    return {
        'success':      True,
        'ref_no':       best_ref,
        'confidence':   round(confidence, 2),
        'method':       first_method,
        'all_hits':     [r for r, _ in hit_log],
        'raw_ocr':      all_raw_text,
        'variants_run': variants_run,
        'message':      f"Reference number found: {best_ref}",
    }
