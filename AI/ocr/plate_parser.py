"""Picks the best valid OCR reading among several candidates."""

from ai.utils.normalization import normalize_plate, looks_like_plate


def best_valid_reading(ocr_results, mode="generic"):
    """mode: 'indian' or 'generic' (see utils/normalization.py)."""
    candidates = []
    for r in ocr_results:
        normalized = normalize_plate(r["text"])
        if looks_like_plate(normalized, mode=mode):
            candidates.append({"plate_number": normalized, "confidence": r["confidence"]})
    if not candidates:
        return None
    candidates.sort(key=lambda c: c["confidence"], reverse=True)
    return candidates[0]
