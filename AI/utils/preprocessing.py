"""Upscale + a couple of processed variants - OCR often reads one better
than the others, so we try all and keep the best result."""

import cv2


def preprocess_plate(plate_crop):
    upscaled = cv2.resize(plate_crop, None, fx=3, fy=3, interpolation=cv2.INTER_CUBIC)
    gray = cv2.cvtColor(upscaled, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (3, 3), 0)
    threshold = cv2.adaptiveThreshold(
        blurred, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 11, 2
    )
    return {"original": upscaled, "gray": gray, "threshold": threshold}
