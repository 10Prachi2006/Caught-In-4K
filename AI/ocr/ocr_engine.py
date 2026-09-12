"""
OCR engine using fast-plate-ocr (github.com/ankandrew/fast-plate-ocr) -
a lightweight model trained SPECIFICALLY on cropped license plates.

This is why it should read plates far more reliably than EasyOCR: EasyOCR
is a general-purpose scene-text reader (built to read street signs, shop
fronts, anything text-like) that happens to also work on plates sometimes.
This model was only ever trained on plate crops, nothing else.

Runs on ONNX Runtime - fast on CPU, no GPU needed. Same read() interface
as the old EasyOCR wrapper, so nothing else in your pipeline needs to
change except this file.

INSTALL:
    pip uninstall easyocr -y      (optional - frees disk space)
    pip install fast-plate-ocr[onnx]
"""

import cv2
import numpy as np
from fast_plate_ocr import LicensePlateRecognizer

# "global" = trained across many countries' plate formats, not just one -
# the right default when your test footage is a mix of formats.
DEFAULT_MODEL = "cct-s-v2-global-model"


class PlateOCR:
    def __init__(self, gpu=False, model_name=DEFAULT_MODEL):
        # gpu kept as a parameter only so ANPRPipeline(gpu=...) doesn't
        # need to change - this library auto-selects its ONNX execution
        # provider based on what you installed (onnx = CPU, onnx-gpu = GPU).
        self.recognizer = LicensePlateRecognizer(model_name)

    def read(self, plate_image):
        if plate_image is None or plate_image.size == 0:
            return []
        if len(plate_image.shape) == 2:
            rgb = cv2.cvtColor(plate_image, cv2.COLOR_GRAY2RGB)
        else:
            rgb = cv2.cvtColor(plate_image, cv2.COLOR_BGR2RGB)

        preds = self.recognizer.run(rgb, return_confidence=True)
        if not preds:
            return []

        pred = preds[0]
        char_probs = pred.char_probs if pred.char_probs is not None else []
        confidence = float(np.mean(char_probs)) if len(char_probs) else 0.0

        return [{
            "text": pred.plate,
            "confidence": confidence,
            "char_confidences": [float(c) for c in char_probs],
        }]