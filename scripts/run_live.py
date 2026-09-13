"""
Starts "live monitoring" mode: each camera's video loops forever, gets
processed continuously, and pushes finalized sightings to the backend
in near-real-time (instead of one batch at the end, like run_video.py).

This also exposes the upload endpoint, so footage can be added WHILE
this is running - you don't need to restart anything to bring a new
camera online.

Run from the REPO ROOT, same folder as run_video.py:
    python run_live.py

Before running:
  1. Start the main backend in another terminal:
       cd backend && uvicorn app.main:app --reload
  2. Keep this process running during your demo - it IS "the cameras".
     Closing it turns every camera off.

Your frontend's Live Monitoring screen should point at (this machine's
address, port 8010):
    GET  http://<host>:8010/live/{camera_id}            <img>/<video> src
    GET  http://<host>:8010/live/status                 online/offline map
    GET  http://<host>:8010/cameras/active               which workers are running
    POST http://<host>:8010/cameras/upload                (multipart form, see below)
    POST http://<host>:8010/cameras/{camera_id}/stop
"""

from ai.live.worker_manager import manager

# Must match backend/seed.py Camera.id values exactly.
CAMERAS = {
    "video1.mp4": "cam01",
    "video2.mp4": "cam02",
    "video3.mp4": "cam03",
}

PLATE_MODE = "generic"     # "indian" once testing real Indian-format plates
USE_GPU = False


def main():
    for video_path, camera_id in CAMERAS.items():
        manager.start(camera_id, video_path, plate_mode=PLATE_MODE, use_gpu=USE_GPU)
        print(f"Started live worker for {camera_id} ({video_path})")

    print("\nLive video available at:")
    for camera_id in CAMERAS.values():
        print(f"  http://127.0.0.1:8010/live/{camera_id}")
    print("\nUpload new footage anytime with:")
    print("  curl -F file=@newcam.mp4 -F camera_id=cam03 -F name='New Camera' "
          "-F lat=23.03 -F lng=72.58 http://127.0.0.1:8010/cameras/upload")
    print("\nStarting stream server on port 8010 (Ctrl+C to stop everything)...\n")

    import uvicorn
    uvicorn.run("ai.live.stream_server:app", host="0.0.0.0", port=8010, log_level="warning")


if __name__ == "__main__":
    main()
