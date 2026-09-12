"""
Cleans up raw OCR text and checks whether it plausibly LOOKS like a plate.
Does NOT prove the plate is real - just filters obvious garbage.

Two modes:
  "indian"  - strict SS-DD-LL-NNNN format (GJ01AB1234)
  "generic" - any plausible plate-like alphanumeric string - USE THIS for
              non-Indian test footage (Pexels/Kaggle clips, UK/US plates,
              etc). This is what caught GX15OGJ correctly in your test.
"""

import re

INDIAN_PLATE_PATTERN = re.compile(r"^[A-Z]{2}[0-9]{1,2}[A-Z]{1,3}[0-9]{1,4}$")
GENERIC_PLATE_PATTERN = re.compile(r"^(?=.*[A-Z])(?=.*[0-9])[A-Z0-9]{5,10}$")


def normalize_plate_with_confidences(raw_text: str, char_confidences: list):
    """Like normalize_plate(), but keeps each surviving character's
    confidence lined up with it, so callers can vote per-position later."""
    text = raw_text.upper()
    kept_chars, kept_confs = [], []
    for i, ch in enumerate(text):
        if ch.isalnum():
            kept_chars.append(ch)
            kept_confs.append(char_confidences[i] if i < len(char_confidences) else None)
    return "".join(kept_chars), kept_confs


def looks_like_indian_plate(text: str) -> bool:
    return bool(INDIAN_PLATE_PATTERN.match(text))


def looks_like_plate(text: str, mode: str = "generic") -> bool:
    if mode == "indian":
        return looks_like_indian_plate(text)
    return bool(GENERIC_PLATE_PATTERN.match(text))
