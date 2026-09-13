"""
Run the full ANPR pipeline on one or more videos (one per camera) and
send results to the backend.

    python run_video.py

Run this from the REPO ROOT (same folder as the `ai/` directory).

WHAT'S NEW vs your last working version:
  1. Majority-vote OCR aggregation (ai/utils/aggregation.py) instead of
     "keep the single highest-confidence frame" - more consistent plates.
  2. A final MIN_COMBINED_CONFIDENCE gate - low-confidence garbage never
     even reaches the backend, instead of relying only on the per-field
     thresholds inside the pipeline.
  3. Multi-camera support - add a second video to CAMERAS below and this
     script processes both, tagging sightings with different camera_ids.
     Cross-camera correlation needs NO backend changes - your existing
     GET /api/v1/vehicles/{plate} already searches across all cameras.

CPU REALITY CHECK: each camera takes roughly as long as your last run did
(~5 min for a similar-length clip). Two cameras = roughly double the time.
"""

import time
import cv2
from ai.pipeline.inference import ANPRPipeline
from ai.pipeline.send_to_backend import send_sighting
from ai.utils.aggregation import PlateAggregator

# ============ SETTINGS ============
# One entry per camera: {video_file: camera_id}. Add a second line once
# you have a second clip - that's your whole "test with 2nd camera" task.
CAMERAS = {
    # IMPORTANT: these values must exactly match the Camera.id rows created
    # by backend/seed.py ("cam01", "cam02") - not any casing/format you like.
    # A mismatch here doesn't break watchlist matching (that's plate-only),
    # but it DOES break the GIS map/route, since the backend can't find a
    # registered camera location for an id it's never seen.
    # "video1.mp4": "cam01",
    "video2.mp4": "cam02",
}

PROCESS_EVERY_N_FRAMES = 5  # raise to 15-20 if still too slow on CPU
USE_GPU = False
PLATE_MODE = "generic"        # "indian" only once testing real Indian plates
SEND_TO_BACKEND = True

# Final quality gate - a sighting must clear THIS to ever reach the
# backend/DB at all, regardless of what individual thresholds inside the
# pipeline already did. This directly answers "confidence threshold /
# reject bad OCR" from the task tracker.
MIN_COMBINED_CONFIDENCE = 0.40
# ===================================


def process_camera(pipeline, video_path, camera_id):
    """Runs the pipeline over one video, returns list of final sightings
    (post majority-vote, post confidence gate) for this camera."""
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        print(f"ERROR: could not open '{video_path}' - skipping this camera.")
        return []

    fps = cap.get(cv2.CAP_PROP_FPS) or 25
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    output_video = f"output_{camera_id}.mp4"
    writer = cv2.VideoWriter(output_video, cv2.VideoWriter_fourcc(*"avc1"), fps, (width, height))

    aggregator = PlateAggregator()
    frame_no = 0
    start_time = time.time()

    print(f"\n=== {camera_id}: '{video_path}' ({total_frames} frames) ===")

    while True:
        ok, frame = cap.read()
        if not ok:
            break
        frame_no += 1

        if frame_no % PROCESS_EVERY_N_FRAMES == 0:
            elapsed = time.time() - start_time
            pct = frame_no / total_frames * 100 if total_frames else 0
            print(f"[{camera_id}] [{pct:5.1f}%] frame {frame_no}/{total_frames}  ({elapsed:.0f}s elapsed)")

            sightings = pipeline.process_frame(frame)
            seconds = frame_no / fps
            video_timestamp = f"{int(seconds // 60):02d}:{seconds % 60:05.2f}"

            for s in sightings:
                s["camera_id"] = camera_id
                s["video_timestamp"] = video_timestamp
                aggregator.add(s["track_id"], s)

                x1, y1, x2, y2 = s["bbox"]
                cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 0, 255), 2)
                cv2.putText(frame, s["plate_number"], (x1, max(0, y1 - 8)),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 255), 2)

        writer.write(frame)

    cap.release()
    writer.release()

    total_time = time.time() - start_time
    aggregated = aggregator.finalize()

    final_sightings = []
    for track_id, sighting in aggregated.items():
        if sighting["combined_confidence"] < MIN_COMBINED_CONFIDENCE:
            print(f"  [{camera_id}] REJECTED track={track_id} plate={sighting['plate_number']} "
                  f"confidence={sighting['combined_confidence']} < {MIN_COMBINED_CONFIDENCE} threshold")
            continue
        final_sightings.append(sighting)

    # Final dedup: if the tracker briefly lost a vehicle (e.g. occluded by
    # another car) it gets assigned a NEW track_id, which would otherwise
    # produce two separate rows for the same plate on the same camera.
    # Same plate + same camera in one run == almost certainly one vehicle,
    # so keep only the highest-confidence reading.
    best_per_plate = {}
    for sighting in final_sightings:
        key = sighting["plate_number"]
        if key not in best_per_plate or sighting["combined_confidence"] > best_per_plate[key]["combined_confidence"]:
            best_per_plate[key] = sighting
    duplicates_removed = len(final_sightings) - len(best_per_plate)
    final_sightings = list(best_per_plate.values())

    for sighting in final_sightings:
        print(f"  [{camera_id}] plate={sighting['plate_number']} track={sighting['track_id']} "
              f"confidence={sighting['combined_confidence']} "
              f"(agreed on {sighting['vote_count']}/{sighting['total_readings']} readings)")

    print(f"[{camera_id}] Done in {total_time:.0f}s. "
          f"{len(final_sightings)} unique vehicle(s) passed the confidence gate"
          + (f" ({duplicates_removed} duplicate track(s) merged)" if duplicates_removed else "")
          + f". Annotated video: {output_video}")

    return final_sightings


def main():
    print("Loading models (first run downloads them - be patient)...")
    pipeline = ANPRPipeline(gpu=USE_GPU, plate_mode=PLATE_MODE)

    all_sightings = []
    for video_path, camera_id in CAMERAS.items():
        all_sightings.extend(process_camera(pipeline, video_path, camera_id))

    print(f"\n=== TOTAL: {len(all_sightings)} sightings across {len(CAMERAS)} camera(s) ===")

    if not all_sightings:
        print("No sightings cleared the confidence gate. Try lowering "
              "MIN_COMBINED_CONFIDENCE above, or check PLATE_MODE matches your footage.")
        return

    if SEND_TO_BACKEND:
        print(f"\nSending {len(all_sightings)} sightings to backend at http://127.0.0.1:8000 ...")
        for sighting in all_sightings:
            payload = {
                "camera_id": sighting["camera_id"],
                "track_id": sighting["track_id"],
                "vehicle_type": sighting["vehicle_type"],
                "plate_number": sighting["plate_number"],
                "vehicle_confidence": sighting["vehicle_confidence"],
                "plate_confidence": sighting["plate_confidence"],
                "ocr_confidence": sighting["ocr_confidence"],
                "system_confidence": sighting["combined_confidence"],
                "bbox": sighting["bbox"],
                "video_timestamp": sighting["video_timestamp"],
            }
            send_sighting(payload)


if __name__ == "__main__":
    main()