"""
The full pipeline: frame -> vehicle detect+track -> crop -> plate detect
-> crop -> preprocess -> OCR (multiple variants) -> best valid reading
-> confidence score -> one sighting dict per vehicle.
"""

from ai.detection.vehicle_detector import VehicleDetector
from ai.detection.plate_detector import PlateDetector
from ai.ocr.ocr_engine import PlateOCR
from ai.ocr.plate_parser import best_valid_reading
from ai.utils.preprocessing import preprocess_plate
from ai.utils.confidence import combined_score


class ANPRPipeline:
    def __init__(self, vehicle_model="yolov8n.pt", gpu=False, plate_mode="generic"):
        """plate_mode: 'indian' for GJ01AB1234-style plates, 'generic' for
        any other country/format (use this for non-Indian test footage)."""
        self.vehicle_detector = VehicleDetector(vehicle_model)
        self.plate_detector = PlateDetector()
        self.ocr = PlateOCR(gpu=gpu)
        self.plate_mode = plate_mode

    def process_frame(self, frame, vehicle_conf=0.4, plate_conf=0.35, ocr_conf_min=0.35):
        sightings = []
        vehicles = self.vehicle_detector.detect_and_track(frame, confidence=vehicle_conf)

        for vehicle in vehicles:
            x1, y1, x2, y2 = vehicle["bbox"]
            vehicle_crop = frame[y1:y2, x1:x2]
            if vehicle_crop.size == 0:
                continue

            plates = self.plate_detector.detect(vehicle_crop, confidence=plate_conf)
            for plate in plates:
                px1, py1, px2, py2 = plate["bbox"]
                fx1, fy1, fx2, fy2 = x1 + px1, y1 + py1, x1 + px2, y1 + py2
                plate_crop = frame[fy1:fy2, fx1:fx2]
                if plate_crop.size == 0:
                    continue

                variants = preprocess_plate(plate_crop)
                all_ocr_results = []
                for variant_img in variants.values():
                    all_ocr_results.extend(self.ocr.read(variant_img))
                all_ocr_results = [r for r in all_ocr_results if r["confidence"] >= ocr_conf_min]

                best = best_valid_reading(all_ocr_results, mode=self.plate_mode)
                if best is None:
                    continue

                score = combined_score(vehicle["confidence"], plate["confidence"], best["confidence"])

                sightings.append({
                    "track_id": vehicle["track_id"],
                    "vehicle_type": vehicle["vehicle_type"],
                    "vehicle_confidence": vehicle["confidence"],
                    "plate_confidence": plate["confidence"],
                    "ocr_confidence": best["confidence"],
                    "plate_number": best["plate_number"],
                    "combined_confidence": score,
                    "bbox": [fx1, fy1, fx2, fy2],
                })

        return sightings
