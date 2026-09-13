"""
One place that owns "which camera workers are currently running".

Used by run_live.py at startup (for your fixed cam01/cam02 test videos)
AND by the /cameras/upload endpoint in stream_server.py (for footage
someone uploads through the frontend while the system is already running).
Both paths go through the same start()/stop() so there's only one way
a camera worker gets created or torn down.
"""

import threading

from ai.live.live_pipeline import run_camera_live
from ai.live.frame_store import store


class WorkerManager:
    def __init__(self):
        self._threads = {}      # camera_id -> Thread
        self._stop_events = {}  # camera_id -> Event
        self._flush_events = {}  # camera_id -> Event
        self._lock = threading.Lock()

    def start(self, camera_id: str, video_path: str, plate_mode: str = "generic", use_gpu: bool = False):
        """Starts a worker for camera_id. If one is already running for
        this camera_id (e.g. re-uploading the same camera), it is stopped
        cleanly first so there's never two threads writing the same
        frame-store slot."""
        with self._lock:
            self._stop_locked(camera_id)

            stop_event = threading.Event()
            flush_event = threading.Event()
            t = threading.Thread(
                target=run_camera_live,
                kwargs=dict(
                    video_path=video_path,
                    camera_id=camera_id,
                    plate_mode=plate_mode,
                    use_gpu=use_gpu,
                    stop_event=stop_event,
                    flush_event=flush_event,
                ),
                daemon=True,
            )
            self._threads[camera_id] = t
            self._stop_events[camera_id] = stop_event
            self._flush_events[camera_id] = flush_event
            t.start()

    def flush(self, camera_id: str) -> bool:
        """Signal the running worker for camera_id to immediately finalize
        and send every currently-tracked vehicle, without waiting for the
        idle/active-time thresholds. Returns False if no worker is running
        for that camera_id."""
        with self._lock:
            event = self._flush_events.get(camera_id)
            if event is None or not self._threads.get(camera_id, None) or not self._threads[camera_id].is_alive():
                return False
            event.set()
            return True

    def stop(self, camera_id: str, timeout: float = 5.0):
        with self._lock:
            self._stop_locked(camera_id, timeout)

    def _stop_locked(self, camera_id: str, timeout: float = 5.0):
        if camera_id in self._stop_events:
            self._stop_events[camera_id].set()
            self._threads[camera_id].join(timeout=timeout)
            del self._stop_events[camera_id]
            del self._threads[camera_id]
            self._flush_events.pop(camera_id, None)
        store.mark_offline(camera_id)

    def active_cameras(self):
        with self._lock:
            return [cid for cid, t in self._threads.items() if t.is_alive()]


# One shared instance for the whole process (imported by run_live.py and
# stream_server.py, which both run inside the same process — see run_live.py)
manager = WorkerManager()