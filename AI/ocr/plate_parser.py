"""Picks the best valid OCR reading among several candidates."""

# from ai.utils.normalization import normalize_plate, looks_like_plate


from ai.utils.normalization import normalize_plate_with_confidences, looks_like_plate


def best_valid_reading(ocr_results, mode="generic"):
    candidates = []
    for r in ocr_results:
        char_confs = r.get("char_confidences", [])
        normalized, aligned_confs = normalize_plate_with_confidences(r["text"], char_confs)
        if looks_like_plate(normalized, mode=mode):
            candidates.append({
                "plate_number": normalized,
                "confidence": r["confidence"],
                "char_confidences": aligned_confs,
            })
    if not candidates:
        return None
    candidates.sort(key=lambda c: c["confidence"], reverse=True)
    return candidates[0]