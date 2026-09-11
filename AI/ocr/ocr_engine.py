"""Thin wrapper around EasyOCR."""

import easyocr


class PlateOCR:
    def __init__(self, gpu=False):
        self.reader = easyocr.Reader(["en"], gpu=gpu)

    def read(self, plate_image):
        if plate_image is None or plate_image.size == 0:
            return []
        results = self.reader.readtext(plate_image)
        return [{"text": text, "confidence": float(conf)} for (_, text, conf) in results]
