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
        """Input: crop of ONE vehicle. Output: plate box(es) in
        VEHICLE-CROP coordinates - caller offsets to full-frame coords."""
        if vehicle_crop is None or vehicle_crop.size == 0:
            return []
        results = self.model(vehicle_crop, conf=confidence, verbose=False)[0]
        plates = []
        for box in results.boxes:
            conf = float(box.conf[0])
            x1, y1, x2, y2 = map(int, box.xyxy[0])
            plates.append({"bbox": [x1, y1, x2, y2], "confidence": conf})
        plates.sort(key=lambda p: p["confidence"], reverse=True)
        return plates[:1]  # a vehicle has one plate - keep the best box
