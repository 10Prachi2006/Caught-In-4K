"""
Tiny, separate FastAPI app for everything "live": video streaming AND
accepting uploaded CCTV footage. Kept separate from backend/app/main.py
so the AI side stays decoupled from the DB layer - this app talks to
the backend only over plain HTTP (requests.post), same as
ai/pipeline/send_to_backend.py already does for sightings.

Run (or just run run_live.py, which does this for you):
    uvicorn ai.live.stream_server:app --port 8010 --reload

Endpoints:
    GET  /live/{camera_id}            -> MJPEG stream (multipart/x-mixed-replace)
    GET  /live/{camera_id}/snapshot   -> single latest JPEG
    GET  /live/status                 -> {camera_id: "online"|"offline", ...}
    GET  /cameras/active              -> [camera_id, ...] currently-running workers
    POST /cameras/upload              -> upload a video file, register it as a
                                          camera in the backend, start live
                                          processing on it immediately
    POST /cameras/{camera_id}/stop    -> stop processing that camera
"""

import os
import time
from pathlib import Path

import requests
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, StreamingResponse

from ai.live.frame_store import store
from ai.live.worker_manager import manager

app = FastAPI(title="IVMAP Live Stream Server")

_raw_origins = os.getenv(
    "CORS_ALLOWED_ORIGINS",
    "http://localhost:5173,https://ivmap-1109.ai.studio",
)
ALLOWED_ORIGINS = [o.strip() for o in _raw_origins.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BACKEND_BASE_URL = os.getenv("BACKEND_BASE_URL", "http://127.0.0.1:8000")
UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", "uploads"))
UPLOAD_DIR.mkdir(exist_ok=True)

ALLOWED_VIDEO_EXTENSIONS = {".mp4", ".mov", ".avi", ".mkv"}


# ─── Live video ─────────────────────────────────────────────────────────────

def _mjpeg_generator(camera_id: str):
    boundary = b"--frame"
    while True:
        frame = store.get(camera_id)
        if frame is not None:
            yield (
                boundary + b"\r\n"
                b"Content-Type: image/jpeg\r\n\r\n" + frame + b"\r\n"
            )
        time.sleep(0.08)  # ~12 fps to the browser - smooth enough, low bandwidth


@app.get("/live/status")
def live_status():
    return {cam_id: store.status(cam_id) for cam_id in store.all_camera_ids()}


@app.get("/live/{camera_id}/snapshot")
def snapshot(camera_id: str):
    frame = store.get(camera_id)
    if frame is None:
        raise HTTPException(status_code=404, detail=f"No live frame yet for '{camera_id}'")
    return Response(content=frame, media_type="image/jpeg")


@app.get("/live/{camera_id}")
def live_stream(camera_id: str):
    if store.get(camera_id) is None:
        raise HTTPException(status_code=404, detail=f"Camera '{camera_id}' is not running")
    return StreamingResponse(
        _mjpeg_generator(camera_id),
        media_type="multipart/x-mixed-replace; boundary=frame",
    )


# ─── Camera lifecycle ───────────────────────────────────────────────────────

@app.get("/cameras/active")
def active_cameras():
    return {"active": manager.active_cameras()}


@app.post("/cameras/upload")
async def upload_camera(
    file: UploadFile = File(...),
    camera_id: str = Form(...),
    name: str = Form(...),
    department: str = Form("Uploaded Footage"),
    lat: float = Form(...),
    lng: float = Form(...),
    plate_mode: str = Form("generic"),
):
    """One call from the frontend does all three things:
      1. Save the uploaded video to disk
      2. Register/update the camera in the backend DB (so it shows up on
         the GIS map, dashboard counts, etc. immediately)
      3. Start a live worker processing that video on a loop
    """
    ext = Path(file.filename or "").suffix.lower()
    if ext not in ALLOWED_VIDEO_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '{ext}'. Allowed: {sorted(ALLOWED_VIDEO_EXTENSIONS)}",
        )

    dest_path = UPLOAD_DIR / f"{camera_id}{ext}"
    contents = await file.read()
    if not contents:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")
    dest_path.write_bytes(contents)

    try:
        resp = requests.post(
            f"{BACKEND_BASE_URL}/api/cameras",
            json={
                "id": camera_id,
                "name": name,
                "department": department,
                "lat": lat,
                "lng": lng,
                "status": "online",
                "vendor": "Uploaded File",
            },
            timeout=5,
        )
        resp.raise_for_status()
    except requests.RequestException as e:
        raise HTTPException(
            status_code=502,
            detail=f"Video saved, but could not register camera with backend at "
                   f"{BACKEND_BASE_URL}: {e}",
        )

    manager.start(camera_id, str(dest_path), plate_mode=plate_mode)

    return {
        "camera_id": camera_id,
        "live_url": f"/live/{camera_id}",
        "snapshot_url": f"/live/{camera_id}/snapshot",
        "status": "starting",
    }


@app.post("/cameras/{camera_id}/stop")
def stop_camera(camera_id: str):
    manager.stop(camera_id)
    return {"camera_id": camera_id, "status": "stopped"}


@app.post("/cameras/{camera_id}/flush")
def flush_camera(camera_id: str):
    """Force-finalize and send every vehicle currently being tracked on
    this camera, right now - without waiting for it to leave frame (idle
    trigger) or for the 24s forced-send timeout. Handy for testing/demoing
    the AI -> backend -> DB path without sitting around waiting."""
    ok = manager.flush(camera_id)
    if not ok:
        raise HTTPException(status_code=404, detail=f"No running worker for camera '{camera_id}'")
    return {"camera_id": camera_id, "status": "flush requested"}