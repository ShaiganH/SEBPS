"""
Image preprocessing pipeline for LESCO bill OCR.

Phone photos of bills suffer from: uneven lighting, slight rotation, blur, low contrast.
We generate multiple preprocessed variants and try OCR on each — the one that yields
a valid reference number wins.
"""

import cv2
import numpy as np
from PIL import Image


def load_image(source) -> np.ndarray:
    """
    Load image from a file path, PIL Image, or raw bytes.
    Returns a BGR numpy array (cv2 native format).
    """
    if isinstance(source, str):
        img = cv2.imread(source)
        if img is None:
            raise FileNotFoundError(f"Cannot read image: {source}")
    elif isinstance(source, Image.Image):
        img = cv2.cvtColor(np.array(source.convert('RGB')), cv2.COLOR_RGB2BGR)
    elif isinstance(source, (bytes, bytearray)):
        arr = np.frombuffer(source, np.uint8)
        img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        if img is None:
            raise ValueError("Cannot decode image from bytes.")
    else:
        raise TypeError("source must be a file path (str), PIL Image, or bytes.")
    return img


def _to_gray(img: np.ndarray) -> np.ndarray:
    return cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) if img.ndim == 3 else img


def _cap_size(img: np.ndarray, max_dim: int = 1400) -> np.ndarray:
    """
    Downscale the image so its longest side is at most max_dim pixels.
    Phone photos (e.g. 4032×3024) make EasyOCR take 15+ s per call;
    capping at 1400 px brings that to ~1.5 s with no accuracy loss for
    typical bill text sizes.  Small/scanned images are left untouched.
    """
    h, w = img.shape[:2]
    longest = max(h, w)
    if longest <= max_dim:
        return img
    scale = max_dim / longest
    new_w, new_h = int(w * scale), int(h * scale)
    return cv2.resize(img, (new_w, new_h), interpolation=cv2.INTER_AREA)


def _upscale(img: np.ndarray, factor: float = 2.0) -> np.ndarray:
    h, w = img.shape[:2]
    return cv2.resize(img, (int(w * factor), int(h * factor)),
                      interpolation=cv2.INTER_CUBIC)


def _clahe(gray: np.ndarray) -> np.ndarray:
    """CLAHE contrast enhancement — helps with uneven phone-photo lighting."""
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    return clahe.apply(gray)


def _denoise(gray: np.ndarray) -> np.ndarray:
    return cv2.fastNlMeansDenoising(gray, h=10, templateWindowSize=7, searchWindowSize=21)


def _binarize_otsu(gray: np.ndarray) -> np.ndarray:
    _, out = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    return out


def _binarize_adaptive(gray: np.ndarray) -> np.ndarray:
    """Handles shadows / gradient lighting across the page."""
    return cv2.adaptiveThreshold(
        gray, 255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY,
        blockSize=31, C=10,
    )


def _dewarp_perspective(img: np.ndarray) -> np.ndarray:
    """
    Attempt to correct perspective distortion from angled hand-held photos.

    Strategy: find the largest rectangular contour (the bill's outline) and
    apply a four-point perspective transform to produce a straight-on view.
    Falls back to the original image if no clear rectangle is found.
    """
    gray = _to_gray(img) if img.ndim == 3 else img
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    edged   = cv2.Canny(blurred, 50, 150)
    edged   = cv2.dilate(edged, np.ones((3, 3), np.uint8), iterations=1)

    contours, _ = cv2.findContours(edged, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return img

    # Pick the largest contour with 4 corners (the bill rectangle)
    contours = sorted(contours, key=cv2.contourArea, reverse=True)
    bill_cnt = None
    for cnt in contours[:5]:
        peri   = cv2.arcLength(cnt, True)
        approx = cv2.approxPolyDP(cnt, 0.02 * peri, True)
        if len(approx) == 4:
            bill_cnt = approx
            break

    if bill_cnt is None:
        return img

    # Order points: top-left, top-right, bottom-right, bottom-left
    pts = bill_cnt.reshape(4, 2).astype(np.float32)
    rect = np.zeros((4, 2), dtype=np.float32)
    s = pts.sum(axis=1)
    rect[0] = pts[np.argmin(s)]   # top-left
    rect[2] = pts[np.argmax(s)]   # bottom-right
    diff = np.diff(pts, axis=1)
    rect[1] = pts[np.argmin(diff)] # top-right
    rect[3] = pts[np.argmax(diff)] # bottom-left

    # Compute output dimensions
    (tl, tr, br, bl) = rect
    w = int(max(np.linalg.norm(br - bl), np.linalg.norm(tr - tl)))
    h = int(max(np.linalg.norm(tr - br), np.linalg.norm(tl - bl)))
    if w < 100 or h < 100:
        return img

    dst = np.array([[0, 0], [w - 1, 0], [w - 1, h - 1], [0, h - 1]], dtype=np.float32)
    M   = cv2.getPerspectiveTransform(rect, dst)
    out = cv2.warpPerspective(img, M, (w, h))
    return out


def _deskew(gray: np.ndarray) -> np.ndarray:
    """Correct small rotation introduced when photographing a bill."""
    thresh = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)[1]
    coords = np.column_stack(np.where(thresh > 0))
    if len(coords) < 200:
        return gray
    angle = cv2.minAreaRect(coords)[-1]
    angle = -(90 + angle) if angle < -45 else -angle
    if abs(angle) < 0.3 or abs(angle) > 20:   # ignore implausible angles
        return gray
    h, w = gray.shape[:2]
    M = cv2.getRotationMatrix2D((w // 2, h // 2), angle, 1.0)
    return cv2.warpAffine(gray, M, (w, h),
                          flags=cv2.INTER_CUBIC,
                          borderMode=cv2.BORDER_REPLICATE)


def get_variants(source) -> list[tuple[str, np.ndarray]]:
    """
    Return a list of (name, image) tuples — each a different preprocessing strategy.
    OCR is attempted on each; the one that finds the reference number wins.

    Ordered cheapest → most aggressive so early-exit works best.

    2× upscale variants are only added for small/scanned images (original longest
    side ≤ 1400 px).  Phone photos are already high-res — upscaling them doubles
    the pixels EasyOCR must scan (17 s/call) with no accuracy gain.
    """
    img  = load_image(source)

    # Detect whether this is a high-res image BEFORE capping
    original_longest = max(img.shape[:2])
    was_large = original_longest > 1400      # phone photo / high-res scan

    img  = _cap_size(img, max_dim=1400)      # ← phone photos: 15 s/call → 2.9 s/call
    gray = _to_gray(img)

    # ── Perspective correction — hand-held angled photo of a paper bill ─────────
    # Detects the bill's rectangular outline and applies a 4-point warp to produce
    # a straight-on view.  Falls back to the original if no clear rectangle found.
    dewarped      = _dewarp_perspective(img)
    dw_gray       = _to_gray(dewarped)
    dw_contrast   = _clahe(dw_gray)
    # Header of the dewarped image
    dw_h_crop     = int(dw_gray.shape[0] * 0.40)
    dw_header     = dw_gray[:dw_h_crop, :]

    # ── Header crop (top 40%) — REF NO is always in the bill header ──────────
    h_crop       = int(gray.shape[0] * 0.40)
    header       = gray[:h_crop, :]
    hdr_contrast = _clahe(header)

    # ── Mid-section crop (20–60%) ─────────────────────────────────────────────
    # When users photograph a bill on a phone screen, the phone's status bar and
    # browser address bar occupy the top ~15-20% of the image, pushing the bill
    # header (which contains REF NO) into the mid-section.
    mid_top      = int(gray.shape[0] * 0.20)
    mid_bot      = int(gray.shape[0] * 0.60)
    mid          = gray[mid_top:mid_bot, :]
    mid_contrast = _clahe(mid)

    # ── Bottom strip (bottom 20%) — barcode has the FULL ref with trailing letter
    # The "REFERENCE NO" table cell often omits the trailing letter; the barcode
    # strip at the very bottom always has the complete 15-char ref.
    bot_top      = int(gray.shape[0] * 0.80)
    bottom       = gray[bot_top:, :]
    bot_contrast = _clahe(bottom)

    # ── Full-image variants (fallback if crops miss) ──────────────────────────
    contrast = _clahe(gray)
    deskewed = _deskew(contrast)
    denoised = _denoise(gray)

    variants: list[tuple[str, np.ndarray]] = [
        # Perspective-corrected variants first — handles angled hand-held photos
        ('dewarp_header',  dw_header),
        ('dewarp_clahe',   dw_contrast),
        # Standard header crops — fast + most likely on clean straight-on photos
        ('header_gray',    header),
        ('header_clahe',   hdr_contrast),
        ('header_otsu',    _binarize_otsu(hdr_contrast)),
        # Mid-section crops — catches REF NO when browser chrome pushes it down
        ('mid_gray',       mid),
        ('mid_clahe',      mid_contrast),
        # Bottom strip — barcode contains the full ref including trailing letter
        ('bottom_gray',    bottom),
        ('bottom_clahe',   bot_contrast),
        # Full image fallback
        ('original_gray',  gray),
        ('clahe',          contrast),
        ('deskewed_clahe', deskewed),
        ('otsu',           _binarize_otsu(contrast)),
        ('adaptive',       _binarize_adaptive(denoised)),
    ]

    # ── 2× upscale variants — only for low-res originals (scans, crops, etc.) ─
    # Skipped for phone photos: upscaling 1050×1400 → 2100×2800 costs 17 s/call
    # with zero benefit when the image is already sharp.
    if not was_large:
        upscaled_gray = _to_gray(_upscale(img, 2.0))
        up_contrast   = _clahe(upscaled_gray)
        variants += [
            ('2x_clahe',    up_contrast),
            ('2x_otsu',     _binarize_otsu(up_contrast)),
            ('2x_adaptive', _binarize_adaptive(_clahe(upscaled_gray))),
        ]

    return variants
