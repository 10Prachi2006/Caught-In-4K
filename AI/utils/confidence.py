"""Weighted 'system confidence score' - a ranking signal, not a
probability the plate is correct."""


def combined_score(vehicle_conf: float, plate_conf: float, ocr_conf: float) -> float:
    score = 0.25 * vehicle_conf + 0.35 * plate_conf + 0.40 * ocr_conf
    return round(score, 3)
