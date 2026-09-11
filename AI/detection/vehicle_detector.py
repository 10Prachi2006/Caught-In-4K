"""
Vehicle detector: finds cars/motorcycles/buses/trucks in a frame AND
tracks them across frames using YOLO's built-in ByteTrack tracker, so the
same physical vehicle keeps one consistent track_id instead of being
treated as a brand-new object every frame.
"""

from ultralytics import YOLO

# Fixed class IDs from the COCO dataset that yolov8n.pt was pretrained on.
VEHICLE_CLASSES = {2: "car", 3: "motorcycle", 5: "bus", 7: "truck"}


class VehicleDetector:
    def __init__(self, model_path="yolov8n.pt"):
        self.model = YOLO(model_path)

    def detect_and_track(self, frame, confidence=0.4):
        """Returns [{track_id, bbox, vehicle_type, confidence}, ...]"""
        results = self.model.track(
            frame,
            conf=confidence,
            persist=True,
            tracker="bytetrack.yaml",
            verbose=False,
        )[0]

        vehicles = []
        if results.boxes is None or results.boxes.id is None:
            return vehicles  # tracker needs a couple of frames to assign IDs

        for box in results.boxes:
            class_id = int(box.cls[0])
            if class_id not in VEHICLE_CLASSES:
                continue
            track_id = int(box.id[0])
            conf = float(box.conf[0])
            x1, y1, x2, y2 = map(int, box.xyxy[0])
            vehicles.append({
                "track_id": track_id,
                "bbox": [x1, y1, x2, y2],
                "vehicle_type": VEHICLE_CLASSES[class_id],
                "confidence": conf,
            })
        return vehicles
