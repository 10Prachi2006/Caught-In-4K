"""
In-memory, thread-safe store of "the latest frame each camera has produced".

One camera worker thread WRITES to this every processed frame; the MJPEG
stream server READS from it every time a browser asks for the next frame.
No disk, no queue - just "what does this camera look like right now".
"""

import threading


class FrameStore:
    def __init__(self):
        self._lock = threading.Lock()
        self._frames = {}   # camera_id -> latest JPEG bytes
        self._status = {}   # camera_id -> "online" | "offline"

    def update(self, camera_id: str, jpeg_bytes: bytes):
        with self._lock:
            self._frames[camera_id] = jpeg_bytes
            self._status[camera_id] = "online"

    def mark_offline(self, camera_id: str):
        with self._lock:
            self._status[camera_id] = "offline"

    def get(self, camera_id: str):
        with self._lock:
            return self._frames.get(camera_id)

    def status(self, camera_id: str) -> str:
        with self._lock:
            return self._status.get(camera_id, "offline")

    def all_camera_ids(self):
        with self._lock:
            return list(self._frames.keys())


# One shared instance imported by both the worker threads and the stream server
store = FrameStore()
