"""
Bridge to module_2_ocr/ref_extractor.py.
"""

import logging

logger = logging.getLogger(__name__)


def extract_reference_number(image_source, early_exit_votes: int = 3) -> dict:
    """
    Run OCR on a bill image and extract the LESCO reference number.

    Parameters
    ----------
    image_source : str (file path), PIL Image, or bytes

    Returns
    -------
    dict with keys: success, ref_no, confidence, method, message
    """
    try:
        from ref_extractor import extract_reference_number as _extract

        return _extract(image_source, early_exit_votes=early_exit_votes)
    except ImportError:
        logger.error("OCR module not found. Check OCR_MODULE_PATH in settings.")
        raise
