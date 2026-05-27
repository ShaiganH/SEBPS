"""
CAPTCHA solver for the LESCO website.

The LESCO CAPTCHA is a 4-character alphanumeric image (e.g. 'QTXN').
Input : raw bytes from Playwright's element.screenshot()
Output: 4-character string (uppercase alphanumeric)

Strategy
--------
1. Upscale the image 4× (CAPTCHA images are tiny, ~150×50 px).
2. Convert to grayscale and try several preprocessing variants.
3. Run EasyOCR on each variant.
4. Pick the result that is exactly 4 alphanumeric characters.
   If multiple variants agree, confidence is higher.
5. If no 4-char result found, return the longest plausible candidate.
"""

import io
import cv2
import numpy as np
from PIL import Image

# Lazy-loaded singleton — shared with module_2_ocr if used together
_reader = None


def _get_reader():
    global _reader
    if _reader is None:
        import easyocr
        _reader = easyocr.Reader(['en'], gpu=False, verbose=False)
    return _reader


def _bytes_to_cv2(img_bytes: bytes) -> np.ndarray:
    arr = np.frombuffer(img_bytes, np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        pil = Image.open(io.BytesIO(img_bytes)).convert('RGB')
        img = cv2.cvtColor(np.array(pil), cv2.COLOR_RGB2BGR)
    return img


def _preprocess_variants(img: np.ndarray) -> list[tuple[str, np.ndarray]]:
    """Return (name, preprocessed_gray) tuples, ordered cheapest → most aggressive."""
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) if img.ndim == 3 else img

    def upscale(x, f=4):
        h, w = x.shape[:2]
        return cv2.resize(x, (w * f, h * f), interpolation=cv2.INTER_CUBIC)

    up     = upscale(gray)
    up_img = upscale(img)
    up_gray_color = cv2.cvtColor(up_img, cv2.COLOR_BGR2GRAY)

    # CLAHE contrast
    clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(4, 4))

    variants = [
        ('4x_gray',           up),
        ('4x_clahe',          clahe.apply(up)),
        ('4x_otsu',           cv2.threshold(up, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)[1]),
        ('4x_otsu_inv',       cv2.threshold(up, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)[1]),
        ('4x_adaptive',       cv2.adaptiveThreshold(up, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                                                     cv2.THRESH_BINARY, 11, 2)),
        ('4x_adaptive_inv',   cv2.bitwise_not(
                                  cv2.adaptiveThreshold(up, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                                                        cv2.THRESH_BINARY, 11, 2))),
        ('4x_color_clahe',    clahe.apply(up_gray_color)),
        ('4x_sharpen',        cv2.filter2D(up, -1,
                                  np.array([[-1,-1,-1],[-1,9,-1],[-1,-1,-1]]))),
    ]
    return variants


def _read_text(gray: np.ndarray) -> str:
    """Run EasyOCR on a single grayscale image, return raw text."""
    reader = _get_reader()
    rgb    = cv2.cvtColor(gray, cv2.COLOR_GRAY2RGB)
    results = reader.readtext(rgb, detail=0, paragraph=False,
                              allowlist='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789')
    raw = ''.join(results).strip().upper()
    # Keep only alphanumeric
    return ''.join(c for c in raw if c.isalnum())


def solve(img_bytes: bytes) -> dict:
    """
    Solve the LESCO CAPTCHA from a Playwright element screenshot.

    Parameters
    ----------
    img_bytes : bytes — from page.locator('img[src*="codeimage"]').screenshot()

    Returns
    -------
    dict
        code        : str   — best 4-char candidate (or best guess if unsure)
        confidence  : float — fraction of variants that produced this exact code
        all_results : list  — all variant outputs (for debugging)
        success     : bool  — True if exactly 4 alphanumeric chars found
    """
    img      = _bytes_to_cv2(img_bytes)
    variants = _preprocess_variants(img)

    results: list[str] = []
    for name, gray in variants:
        text = _read_text(gray)
        results.append(text)

    # Prefer exactly-4-char results
    four_char = [r for r in results if len(r) == 4]

    if four_char:
        from collections import Counter
        vote  = Counter(four_char)
        best, count = vote.most_common(1)[0]
        return {
            'code':        best,
            'confidence':  round(count / len(variants), 2),
            'all_results': list(zip([v[0] for v in variants], results)),
            'success':     True,
        }

    # No exactly-4 result — take the most common non-empty result truncated/padded
    non_empty = [r for r in results if r]
    if non_empty:
        from collections import Counter
        best = Counter(non_empty).most_common(1)[0][0]
        best = (best + 'X' * 4)[:4]   # pad or truncate to 4
        return {
            'code':        best,
            'confidence':  0.0,
            'all_results': list(zip([v[0] for v in variants], results)),
            'success':     False,
        }

    return {
        'code':        '',
        'confidence':  0.0,
        'all_results': list(zip([v[0] for v in variants], results)),
        'success':     False,
    }
