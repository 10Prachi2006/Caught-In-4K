"""
Plate detector: finds the actual license plate INSIDE a vehicle crop,
using a YOLOv8 model trained specifically for plates. Auto-downloads and
caches the weights on first run.
"""

import os
import shutil
import urllib.request
from ultralytics import YOLO

HF_REPO_ID = "Koushim/yolov8-license-plate-detection"
HF_FILENAME = "best.pt"
FALLBACK_URL = "https://huggingface.co/Koushim/yolov8-license-plate-detection/resolve/main/best.pt"
DEFAULT_PLATE_MODEL_PATH = "license_plate_detector.pt"


def _download_plate_model(model_path):
    print("Downloading plate-detector weights (one-time)...")
    try:
        from huggingface_hub import hf_hub_download
        cached_path = hf_hub_download(repo_id=HF_REPO_ID, filename=HF_FILENAME)
        shutil.copy(cached_path, model_path)
    except Exception as e:
        print(f"huggingface_hub method failed ({e}), trying direct URL fallback...")
        urllib.request.urlretrieve(FALLBACK_URL, model_path)
    print("Plate detector weights ready.")


class PlateDetector:
    def __init__(self, model_path=DEFAULT_PLATE_MODEL_PATH):
        if not os.path.exists(model_path):
            _download_plate_model(model_path)
        self.model = YOLO(model_path)

    def detect(self, vehicle_crop, confidence=0.35):
        if vehicle_crop is None or vehicle_crop.size == 0:
            return []
        results = self.model(vehicle_crop, conf=confidence, verbose=False)[0]
        h, w = vehicle_crop.shape[:2]
        plates = []
        for box in results.boxes:
            conf = float(box.conf[0])
            x1, y1, x2, y2 = map(int, box.xyxy[0])
            pad_x = int((x2 - x1) * 0.18)
            pad_y = int((y2 - y1) * 0.20)
            x1 = max(0, x1 - pad_x)
            y1 = max(0, y1 - pad_y)
            x2 = min(w, x2 + pad_x)
            y2 = min(h, y2 + pad_y)
            plates.append({"bbox": [x1, y1, x2, y2], "confidence": conf})
        plates.sort(key=lambda p: p["confidence"], reverse=True)
        return plates[:1]
