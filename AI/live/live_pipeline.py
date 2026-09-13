"""
Turns your existing batch pipeline into a "live camera" simulation.

Same detection/OCR/aggregation code as run_video.py - nothing about the
AI model changes. What's different:

  1. The video LOOPS forever instead of stopping at the last frame
     (a real camera never runs out of footage).
  2. A vehicle's plate is finalized and POSTed to the backend the moment
     its track goes idle (hasn't been seen for IDLE_FRAMES frames) -
     i.e. "the car just left the frame" - instead of waiting for the
     entire video to finish. This is what makes alerts/sightings show
     up on the dashboard in near-real-time while the "camera" runs.
  3. Every processed frame (annotated with boxes) is pushed into the
     shared FrameStore so the live MJPEG endpoint can serve it.

Run one of these per camera (see run_live.py), each in its own thread.
"""

import os
import time
import cv2
from rapidfuzz import fuzz

from ai.pipeline.inference import ANPRPipeline
from ai.pipeline.send_to_backend import send_sighting
from ai.utils.aggregation import PlateAggregator
from ai.live.frame_store import store

# A track that hasn't produced a new reading for this many processed
# samples is considered "gone" (vehicle left frame / occluded away) and
# gets finalized. With PROCESS_EVERY_N_FRAMES=5 and 25fps footage, 20
# samples ≈ 4 seconds of real time with no sighting on that track.
#
# Override for fast dev/testing without editing this file, e.g.:
#   LIVE_IDLE_SAMPLES=6 LIVE_MAX_ACTIVE_SAMPLES=20 python run_live.py
# Leave unset for the demo - the defaults below are the realistic values.
IDLE_SAMPLES_BEFORE_FINALIZE = int(os.getenv("LIVE_IDLE_SAMPLES", "20"))
MIN_COMBINED_CONFIDENCE = 0.40

# A track that NEVER goes idle (parked vehicle, or the tracker keeps
# re-detecting it every sample) would otherwise accumulate readings
# forever and never get sent - silently invisible in the DB, and an
# unbounded memory leak. Force a finalize+send after this many *active*
# samples even if the vehicle hasn't left frame yet, then keep tracking
# it under the same ID (report cooldown prevents this from spamming).
MAX_ACTIVE_SAMPLES_BEFORE_FORCE_SEND = int(os.getenv("LIVE_MAX_ACTIVE_SAMPLES", "120"))  # ~24s of continuous presence

# Cap how many raw readings we keep per track. PlateAggregator only needs
# a representative sample to vote correctly - it doesn't need thousands.
MAX_READINGS_PER_TRACK = 150

# Your test clips loop every ~10-15s. Without this, the SAME physical
# vehicle gets finalized and POSTed again every single loop, forever,
# flooding vehicle_sightings with near-duplicate rows (backend's own
# dedup window is only 8s, shorter than one loop). Once a plate has been
# reported for a camera, it's suppressed here for this many seconds
# before being allowed to send again - same "already reported, don't
# report again" cooldown described in your live-monitoring reference.
REPORT_COOLDOWN_SECONDS = 45

# Same threshold PlateAggregator uses to cluster OCR drift of the same
# physical plate - reused here so "DL3CAM1234" and "DL3CAM123" (one
# dropped char between loops) are recognized as the same recent report
# instead of each restarting their own cooldown.
COOLDOWN_SIMILARITY_THRESHOLD = 85


def _recently_reported(plate: str, recent_sends: list) -> bool:
    now = time.time()
    for sent_plate, sent_at in recent_sends:
        if now - sent_at > REPORT_COOLDOWN_SECONDS:
            continue
        if fuzz.ratio(plate, sent_plate) >= COOLDOWN_SIMILARITY_THRESHOLD:
            return True
    return False


def _finalize_track(track_id, readings):
    """Reuses PlateAggregator's clustering/voting logic for exactly ONE
    track's accumulated readings, without waiting for other tracks or
    the end of the video."""
    temp = PlateAggregator()
    temp._readings[track_id] = readings
    result = temp.finalize()
    return result.get(track_id)


def run_camera_live(video_path: str, camera_id: str, plate_mode: str = "generic",
                     process_every_n_frames: int = 5, use_gpu: bool = False,
                     stop_event=None, flush_event=None):
    """Blocking call - run this in its own thread, one per camera.

    stop_event: a threading.Event(). When set, the loop exits cleanly on
    the next frame boundary instead of running forever. Passed in by
    WorkerManager so a camera can be stopped/replaced (e.g. re-uploaded)
    without killing the whole process.

    flush_event: a threading.Event(). When set (e.g. via
    POST /cameras/{id}/flush), every currently-tracked vehicle is
    finalized and sent immediately, regardless of idle/active counters -
    useful for testing without waiting 24s for the forced-send threshold."""
    print(f"[live:{camera_id}] starting worker for '{video_path}'")
    pipeline = ANPRPipeline(gpu=use_gpu, plate_mode=plate_mode)

    track_readings = {}      # track_id -> [reading, reading, ...]
    track_idle_count = {}    # track_id -> samples since last seen
    track_active_count = {}  # track_id -> samples seen since last (force-)send
    recent_sends = []        # [(plate_number, time.time()), ...] per this camera

    def _finalize_and_send(tid, reason: str):
        """Shared by idle-finalize, force-finalize (still-active), and the
        shutdown flush - one path so all three obey the same confidence
        floor and cooldown, and can never double-send the same dwell."""
        readings = track_readings.get(tid)
        if not readings:
            return
        final = _finalize_track(tid, readings)
        if final is None:
            print(f"[live:{camera_id}] DIAGNOSTIC: track={tid} ({reason}) "
                  f"had {len(readings)} reading(s) but finalize() returned None")
            return
        if final["combined_confidence"] < MIN_COMBINED_CONFIDENCE:
            print(f"[live:{camera_id}] DIAGNOSTIC: track={tid} ({reason}) "
                  f"plate={final['plate_number']} conf={final['combined_confidence']:.2f} "
                  f"DROPPED - below MIN_COMBINED_CONFIDENCE={MIN_COMBINED_CONFIDENCE}")
            return

        now = time.time()
        if _recently_reported(final["plate_number"], recent_sends):
            print(f"[live:{camera_id}] DIAGNOSTIC: plate={final['plate_number']} "
                  f"({reason}) suppressed - within {REPORT_COOLDOWN_SECONDS}s cooldown")
            return

        print(f"[live:{camera_id}] track={tid} plate={final['plate_number']} "
              f"confidence={final['combined_confidence']} "
              f"(agreed on {final['vote_count']}/{final['total_readings']} readings) "
              f"-> sending ({reason})")

        recent_sends.append((final["plate_number"], now))
        recent_sends[:] = [(p, t) for p, t in recent_sends if now - t <= REPORT_COOLDOWN_SECONDS]

        payload = {
            "camera_id": camera_id,
            "track_id": final["track_id"],
            "vehicle_type": final["vehicle_type"],
            "plate_number": final["plate_number"],
            "vehicle_confidence": final["vehicle_confidence"],
            "plate_confidence": final["plate_confidence"],
            "ocr_confidence": final["ocr_confidence"],
            "system_confidence": final["combined_confidence"],
            "bbox": final["bbox"],
            "video_timestamp": final["video_timestamp"],
        }
        send_sighting(payload)

    frame_no = 0
    cap = cv2.VideoCapture(video_path, cv2.CAP_FFMPEG)
    if not cap.isOpened():
        print(f"[live:{camera_id}] ERROR: could not open '{video_path}'")
        store.mark_offline(camera_id)
        return

    fps = cap.get(cv2.CAP_PROP_FPS) or 25
    reported_frame_count = cap.get(cv2.CAP_PROP_FRAME_COUNT)
    frame_interval = 1.0 / fps
    consecutive_read_failures = 0
    print(f"[live:{camera_id}] DIAGNOSTIC: opened ok, fps={fps}, "
          f"reported_frame_count={reported_frame_count}")

    try:
        while not (stop_event is not None and stop_event.is_set()):
            loop_start = time.time()
            ok, frame = cap.read()

            if not ok:
                consecutive_read_failures += 1
                print(f"[live:{camera_id}] DIAGNOSTIC: read failed after "
                      f"{frame_no} good frame(s) this pass "
                      f"(consecutive_read_failures={consecutive_read_failures})")
                if consecutive_read_failures >= 30:
                    # Not a normal end-of-file loop - the file genuinely
                    # can't be decoded in this thread/backend. Fail loudly
                    # instead of spinning the CPU forever in silence.
                    print(f"[live:{camera_id}] ERROR: {consecutive_read_failures} "
                          f"consecutive read failures on '{video_path}' - giving up. "
                          f"Check the file is a valid, playable video.")
                    store.mark_offline(camera_id)
                    return
                # Camera "loops" - a real feed never ends, so neither does this.
                cap.release()
                cap = cv2.VideoCapture(video_path, cv2.CAP_FFMPEG)
                frame_no = 0
                time.sleep(0.2)  # avoid a tight CPU-pegging spin if this keeps failing
                print(f"[live:{camera_id}] video looped")
                continue

            consecutive_read_failures = 0

            frame_no += 1
            seen_this_sample = set()

            if flush_event is not None and flush_event.is_set():
                pending = list(track_readings.keys())
                print(f"[live:{camera_id}] manual flush requested - "
                      f"finalizing {len(pending)} currently-tracked vehicle(s)")
                for tid in pending:
                    _finalize_and_send(tid, reason="manual flush")
                    track_readings.pop(tid, None)
                    track_idle_count.pop(tid, None)
                    track_active_count.pop(tid, None)
                flush_event.clear()

            if frame_no % process_every_n_frames == 0:
                sightings = pipeline.process_frame(frame)
                seconds = frame_no / fps
                video_timestamp = f"{int(seconds // 60):02d}:{seconds % 60:05.2f}"

                if sightings:
                    print(f"[live:{camera_id}] DIAGNOSTIC: frame={frame_no} raw sightings: "
                          + ", ".join(f"track={s['track_id']} plate={s['plate_number']} "
                                      f"conf={s['combined_confidence']:.2f}" for s in sightings))
                elif frame_no % (process_every_n_frames * 10) == 0:
                    # Heartbeat every ~10 samples so silence doesn't look
                    # like the pipeline isn't running at all.
                    print(f"[live:{camera_id}] DIAGNOSTIC: frame={frame_no} - "
                          f"pipeline ran, 0 sightings this sample")

                for s in sightings:
                    tid = s["track_id"]
                    seen_this_sample.add(tid)
                    s["camera_id"] = camera_id
                    s["video_timestamp"] = video_timestamp
                    bucket = track_readings.setdefault(tid, [])
                    bucket.append(s)
                    if len(bucket) > MAX_READINGS_PER_TRACK:
                        # Keep it bounded - drop the oldest, keep voting on
                        # a rolling recent window instead of growing forever.
                        del bucket[: len(bucket) - MAX_READINGS_PER_TRACK]
                    track_idle_count[tid] = 0
                    track_active_count[tid] = track_active_count.get(tid, 0) + 1

                    if track_active_count[tid] >= MAX_ACTIVE_SAMPLES_BEFORE_FORCE_SEND:
                        # Vehicle has been continuously present (parked,
                        # queued at a signal, etc.) without ever going
                        # idle - don't wait forever to report it.
                        _finalize_and_send(tid, reason="still active, forced")
                        track_active_count[tid] = 0
                        track_readings[tid] = []

                    x1, y1, x2, y2 = s["bbox"]
                    cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 0, 255), 2)
                    cv2.putText(frame, s["plate_number"], (x1, max(0, y1 - 8)),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 255), 2)

                # Age out every track NOT seen this sample; finalize+send the
                # ones that just crossed the idle threshold.
                for tid in list(track_readings.keys()):
                    if tid in seen_this_sample:
                        continue
                    track_idle_count[tid] = track_idle_count.get(tid, 0) + 1
                    if track_idle_count[tid] < IDLE_SAMPLES_BEFORE_FINALIZE:
                        continue

                    _finalize_and_send(tid, reason="went idle")
                    track_readings.pop(tid, None)
                    track_idle_count.pop(tid, None)
                    track_active_count.pop(tid, None)

            # Push the (possibly annotated) frame for the live view regardless
            # of whether this sample ran AI, so the video looks smooth.
            ok_encode, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 70])
            if ok_encode:
                store.update(camera_id, buf.tobytes())

            # Pace playback to roughly real-time so it looks like a live feed
            # instead of playing as fast as the CPU can chew through it.
            elapsed = time.time() - loop_start
            sleep_for = frame_interval - elapsed
            if sleep_for > 0:
                time.sleep(sleep_for)
    finally:
        # Flush whatever hasn't gone idle yet - otherwise stopping the
        # worker (Ctrl+C, re-upload, /cameras/{id}/stop) silently throws
        # away every vehicle currently mid-dwell, which is the single
        # most likely reason a short manual test shows nothing in the DB.
        for tid in list(track_readings.keys()):
            _finalize_and_send(tid, reason="worker stopping, flushed")
        cap.release()
        store.mark_offline(camera_id)
        print(f"[live:{camera_id}] worker stopped")