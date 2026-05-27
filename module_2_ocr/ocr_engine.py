"""
OCR engine wrappers.

Primary  : EasyOCR  (pip install easyocr)
Fallback : pytesseract  (pip install pytesseract + brew install tesseract)

EasyOCR model files (~100 MB) are downloaded on first use and cached in ~/.EasyOCR/.
"""

import cv2
import numpy as np

# ── EasyOCR (primary) ─────────────────────────────────────────────────────────

_reader = None   # lazy singleton — model load is slow, keep it alive


def _get_reader():
    global _reader
    if _reader is None:
        import easyocr
        print("[OCR] Loading EasyOCR model (first run downloads ~100 MB)…")
        _reader = easyocr.Reader(['en'], gpu=False, verbose=False)
        print("[OCR] Model ready.")
    return _reader


def ocr_easyocr(gray: np.ndarray) -> list[str]:
    """
    Run EasyOCR on a grayscale / binary image.
    Returns list of text strings (one per detected text block).
    """
    try:
        reader = _get_reader()
        # EasyOCR wants RGB
        rgb = cv2.cvtColor(gray, cv2.COLOR_GRAY2RGB) if gray.ndim == 2 else gray
        results = reader.readtext(rgb, detail=0, paragraph=False)
        return [str(r).strip() for r in results if str(r).strip()]
    except Exception as exc:
        print(f"[OCR] EasyOCR error: {exc}")
        return []


# ── pytesseract (fallback) ────────────────────────────────────────────────────

def ocr_tesseract(gray: np.ndarray, psm: int = 11) -> list[str]:
    """
    Run pytesseract.  Returns [] gracefully if tesseract is not installed.
    psm 11 = sparse text (good for mixed layouts like LESCO bills).
    psm  6 = uniform block.
    """
    try:
        import pytesseract
        from PIL import Image as PILImage

        pil = PILImage.fromarray(gray)
        cfg = f'--oem 3 --psm {psm}'
        raw = pytesseract.image_to_string(pil, config=cfg)
        return [ln.strip() for ln in raw.splitlines() if ln.strip()]
    except ImportError:
        return []
    except Exception as exc:
        print(f"[OCR] Tesseract error: {exc}")
        return []


# ── Combined runner ───────────────────────────────────────────────────────────

def run_ocr(gray: np.ndarray) -> list[str]:
    """
    Run all available engines on one preprocessed image.
    Returns a flat, deduplicated list of text tokens.
    """
    lines: list[str] = []

    easy = ocr_easyocr(gray)
    lines.extend(easy)

    # Add tesseract variants only if EasyOCR found nothing
    if not easy:
        for psm in (11, 6, 3):
            lines.extend(ocr_tesseract(gray, psm))

    # Deduplicate while preserving order
    seen: set[str] = set()
    unique = []
    for ln in lines:
        if ln not in seen:
            seen.add(ln)
            unique.append(ln)
    return unique
