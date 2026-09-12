"""
IVMAP Backend — main.py (v2)

Run from inside backend/:
    uvicorn app.main:app --reload

Docs / interactive test UI: http://127.0.0.1:8000/docs

Endpoints implemented:
  GET  /api/health
  GET  /api/dashboard/summary
  GET  /api/alerts                    ?priority= &status= &limit=
  PATCH /api/alerts/{id}              body {status}
  GET  /api/cameras
  GET  /api/cameras/status            (alias for /api/cameras)
  GET  /api/cameras/{id}
  GET  /api/vehicles/{plate}/sightings
  GET  /api/vehicles/{plate}/route
  GET  /api/gis/cameras               (alias for /api/cameras)
  GET  /api/gis/alerts                (active alerts)
  GET  /api/detections/recent         ?limit=
  GET  /api/watchlist/{id}
  GET  /api/sightings/{id}
  POST /api/v1/sightings              (AI ingestion — contract frozen)
"""

import base64
import os
import re
import uuid
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import desc, func
from sqlalchemy.orm import Session

from rapidfuzz.distance import Levenshtein


from .database import Base, engine, get_db
from .models import Alert, Camera, VehicleSighting, WatchlistEntity
from .schemas import (
    AlertOut,
    AlertStatusUpdate,
    CameraOut,
    DashboardSummaryOut,
    VehicleSightingCreate,
    VehicleSightingOut,
    WatchlistEntityOut,
)

# ─── App setup ────────────────────────────────────────────────────────────────

app = FastAPI(title="IVMAP Backend", version="2.0.0")


def _ensure_sqlite_schema_compatibility() -> None:
    """Backfill missing columns for older SQLite DB files created before the
    v2 alert schema shipped. Without this, attempts to INSERT into alerts can
    fail with `no such column` / `no column named ...` errors.
    """
    try:
        with engine.begin() as conn:
            tables = {
                row[0]
                for row in conn.exec_driver_sql(
                    "SELECT name FROM sqlite_master WHERE type='table'"
                ).fetchall()
            }

            if "alerts" in tables:
                alerts_cols = {
                    row[1]
                    for row in conn.exec_driver_sql("PRAGMA table_info(alerts)").fetchall()
                }
                for column_name, column_sql in {
                    "camera_name": "VARCHAR(100)",
                    "plate_number": "VARCHAR(30)",
                    "category": "VARCHAR(30)",
                    "match_type": "VARCHAR(20) DEFAULT 'exact'",
                    "matched_plate": "VARCHAR(30)",
                    "resolved_at": "DATETIME",
                }.items():
                    if column_name not in alerts_cols:
                        conn.exec_driver_sql(
                            f"ALTER TABLE alerts ADD COLUMN {column_name} {column_sql}"
                        )

            if "watchlist_entities" in tables:
                watchlist_cols = {
                    row[1]
                    for row in conn.exec_driver_sql("PRAGMA table_info(watchlist_entities)").fetchall()
                }
                for column_name, column_sql in {
                    "reference_no": "VARCHAR(50)",
                    "description": "TEXT",
                    "plate_number": "VARCHAR(30)",
                    "created_at": "DATETIME",
                }.items():
                    if column_name not in watchlist_cols:
                        conn.exec_driver_sql(
                            f"ALTER TABLE watchlist_entities ADD COLUMN {column_name} {column_sql}"
                        )

            if "vehicle_sightings" in tables:
                sighting_cols = {
                    row[1]
                    for row in conn.exec_driver_sql("PRAGMA table_info(vehicle_sightings)").fetchall()
                }
                for column_name, column_sql in {
                    "watchlist_match_id": "VARCHAR(36)",
                    "evidence_frame_url": "VARCHAR(255)",
                    "detected_at": "DATETIME",
                }.items():
                    if column_name not in sighting_cols:
                        conn.exec_driver_sql(
                            f"ALTER TABLE vehicle_sightings ADD COLUMN {column_name} {column_sql}"
                        )
    except Exception as exc:
        print(f"[backend] schema compatibility check failed: {exc}")
        raise


# Create tables on startup
Base.metadata.create_all(bind=engine)
_ensure_sqlite_schema_compatibility()


# CORS — read from env, default to Vite dev + deployed frontend
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

# Static files for evidence frames
STATIC_DIR = Path(__file__).parent.parent / "static"
EVIDENCE_DIR = STATIC_DIR / "evidence"
EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _norm_plate(plate: str) -> str:
    """Uppercase + strip whitespace/dashes."""
    return re.sub(r"[\s\-]", "", plate).upper()


# ─── Health ───────────────────────────────────────────────────────────────────

@app.get("/")
def root():
    return {"system": "IVMAP", "status": "running", "version": "2.0.0"}


@app.get("/api/health")
def health():
    return {"status": "ok"}


# ─── Dashboard ────────────────────────────────────────────────────────────────

@app.get("/api/dashboard/summary")
def dashboard_summary(db: Session = Depends(get_db)):
    try:
        cameras = db.query(Camera).all()
        total = len(cameras)
        online = sum(1 for c in cameras if c.status == "online")
        offline = total - online

        active_alerts = db.query(Alert).filter(Alert.status == "new").count()

        today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
        vehicles_today = (
            db.query(func.count(func.distinct(VehicleSighting.plate_number)))
            .filter(VehicleSighting.detected_at >= today_start)
            .scalar()
            or 0
        )

        critical = (
            db.query(Alert)
            .filter(Alert.priority == "critical", Alert.status != "resolved")
            .count()
        )

        system_health = "degraded" if offline > 0 else "healthy"

        return DashboardSummaryOut(
            totalCameras=total,
            camerasOnline=online,
            camerasOffline=offline,
            activeAlerts=active_alerts,
            vehiclesTrackedToday=vehicles_today,
            criticalIncidents=critical,
            systemHealth=system_health,
        )
    except Exception:
        return DashboardSummaryOut(
            totalCameras=0,
            camerasOnline=0,
            camerasOffline=0,
            activeAlerts=0,
            vehiclesTrackedToday=0,
            criticalIncidents=0,
            systemHealth="degraded",
        )


# ─── Alerts ───────────────────────────────────────────────────────────────────

@app.get("/api/alerts")
def get_alerts(
    priority: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    limit: int = Query(50),
    db: Session = Depends(get_db),
):
    q = db.query(Alert).order_by(desc(Alert.created_at))
    if priority and priority != "all":
        q = q.filter(Alert.priority == priority)
    if status and status != "all":
        q = q.filter(Alert.status == status)
    rows = q.limit(limit).all()
    return [AlertOut.from_orm_row(r) for r in rows]


@app.patch("/api/alerts/{alert_id}")
def update_alert(alert_id: str, body: AlertStatusUpdate, db: Session = Depends(get_db)):
    row = db.query(Alert).filter(Alert.id == alert_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Alert not found")

    valid_statuses = {"acknowledged", "resolved"}
    if body.status not in valid_statuses:
        raise HTTPException(status_code=422, detail=f"status must be one of {valid_statuses}")

    row.status = body.status
    if body.status == "resolved":
        row.resolved_at = datetime.utcnow()
    db.commit()
    db.refresh(row)
    return AlertOut.from_orm_row(row)


# ─── Cameras ──────────────────────────────────────────────────────────────────

@app.get("/api/cameras")
def get_cameras(db: Session = Depends(get_db)):
    rows = db.query(Camera).all()
    return [CameraOut.model_validate(r) for r in rows]


# Alias — frontend calls both /cameras and /cameras/status
@app.get("/api/cameras/status")
def get_camera_statuses(db: Session = Depends(get_db)):
    rows = db.query(Camera).all()
    return [CameraOut.model_validate(r) for r in rows]


@app.get("/api/cameras/{camera_id}")
def get_camera(camera_id: str, db: Session = Depends(get_db)):
    row = db.query(Camera).filter(Camera.id == camera_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Camera not found")
    return CameraOut.model_validate(row)


# ─── Vehicles ─────────────────────────────────────────────────────────────────

@app.get("/api/vehicles/{plate}/sightings")
def get_vehicle_sightings(plate: str, db: Session = Depends(get_db)):
    norm = _norm_plate(plate)
    rows = (
        db.query(VehicleSighting)
        .filter(VehicleSighting.plate_number == norm)
        .order_by(desc(VehicleSighting.detected_at))
        .all()
    )
    return [VehicleSightingOut.from_orm_row(r) for r in rows]


@app.get("/api/vehicles/{plate}/route")
def get_vehicle_route(plate: str, db: Session = Depends(get_db)):
    """
    Return [{camera, sighting}] in chronological order.
    Duplicate-suppresses: collapses sightings at the same camera within a 5s window.
    """
    norm = _norm_plate(plate)
    rows = (
        db.query(VehicleSighting)
        .filter(VehicleSighting.plate_number == norm)
        .order_by(VehicleSighting.detected_at.asc())
        .all()
    )

    # Deduplicate: same camera within 5-second window
    deduped = []
    window = timedelta(seconds=5)
    for r in rows:
        if deduped:
            last = deduped[-1]
            if (
                last.camera_id == r.camera_id
                and r.detected_at is not None
                and last.detected_at is not None
                and (r.detected_at - last.detected_at) < window
            ):
                continue
        deduped.append(r)

    result = []
    for r in deduped:
        cam = db.query(Camera).filter(Camera.id == r.camera_id).first()
        if cam:
            result.append({
                "camera": CameraOut.model_validate(cam).model_dump(by_alias=False),
                "sighting": VehicleSightingOut.from_orm_row(r).model_dump(by_alias=False),
            })
    return result


# ─── GIS ──────────────────────────────────────────────────────────────────────

@app.get("/api/gis/cameras")
def gis_cameras(db: Session = Depends(get_db)):
    rows = db.query(Camera).all()
    return [CameraOut.model_validate(r) for r in rows]


@app.get("/api/gis/alerts")
def gis_alerts(db: Session = Depends(get_db)):
    rows = (
        db.query(Alert)
        .filter(Alert.status != "resolved")
        .order_by(desc(Alert.created_at))
        .limit(100)
        .all()
    )
    return [AlertOut.from_orm_row(r) for r in rows]


# ─── Recent Detections ────────────────────────────────────────────────────────

@app.get("/api/detections/recent")
def recent_detections(limit: int = Query(8), db: Session = Depends(get_db)):
    rows = (
        db.query(VehicleSighting)
        .order_by(desc(VehicleSighting.detected_at))
        .limit(limit)
        .all()
    )
    return [VehicleSightingOut.from_orm_row(r) for r in rows]


# ─── Watchlist ────────────────────────────────────────────────────────────────

@app.get("/api/watchlist/{entity_id}")
def get_watchlist_entity(entity_id: str, db: Session = Depends(get_db)):
    row = db.query(WatchlistEntity).filter(WatchlistEntity.id == entity_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Watchlist entity not found")
    return WatchlistEntityOut.from_orm_row(row)


# ─── Sightings ────────────────────────────────────────────────────────────────

@app.get("/api/sightings/{sighting_id}")
def get_sighting(sighting_id: str, db: Session = Depends(get_db)):
    row = db.query(VehicleSighting).filter(VehicleSighting.id == sighting_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Sighting not found")
    return VehicleSightingOut.from_orm_row(row)


# ─── AI ingestion (contract frozen — AI teammate's script depends on this) ────

@app.post("/api/v1/sightings")
def create_sighting(payload: VehicleSightingCreate, db: Session = Depends(get_db)):
    """
    Store a sighting from the AI pipeline, run watchlist match, raise alert.

    Changes from v1 (internals only — request/response shape unchanged):
    - Normalises plate before matching
    - Duplicate suppression: same plate + camera within 8s → update, don't insert
    - Matches against watchlist_entities (not the old flat watchlist table)
    - Creates Alert with proper FK to both watchlist_entity and sighting
    - Optional evidence_image_base64: saves to static/evidence/ if present
    """
    norm_plate = _norm_plate(payload.plate_number)
    now = datetime.utcnow()
    dedup_window = timedelta(seconds=8)

    # ── Duplicate suppression ──────────────────────────────────────────────────
    existing = (
        db.query(VehicleSighting)
        .filter(
            VehicleSighting.plate_number == norm_plate,
            VehicleSighting.camera_id == payload.camera_id,
            VehicleSighting.detected_at >= now - dedup_window,
        )
        .order_by(desc(VehicleSighting.detected_at))
        .first()
    )

    if existing:
        # Update confidences + timestamp instead of creating a duplicate row
        existing.track_id = str(payload.track_id) if payload.track_id is not None else existing.track_id
        existing.vehicle_confidence = payload.vehicle_confidence
        existing.plate_confidence = payload.plate_confidence
        existing.ocr_confidence = payload.ocr_confidence
        existing.system_confidence = payload.system_confidence
        existing.detected_at = now
        db.commit()
        db.refresh(existing)

        # Return same shape as a fresh insert so AI script is happy
        alert_row = (
            db.query(Alert)
            .filter(Alert.vehicle_sighting_id == existing.id)
            .first()
        )
        return {
            "sighting_id": existing.id,
            "plate_number": norm_plate,
            "watchlist_match": existing.watchlist_match_id is not None,
            "alert_id": alert_row.id if alert_row else None,
            "alert": {
                "status": alert_row.status,
                "priority": alert_row.priority,
                "message": f"Duplicate suppressed — sighting updated",
            } if alert_row else None,
        }

    # ── Auto-register unknown cameras ──────────────────────────────────────────
    # If the AI reports a camera_id that was never seeded/registered (typo,
    # casing mismatch, or a genuinely new camera nobody added yet), don't
    # silently drop its sightings from the map/route - register a stub so
    # it's immediately visible, then someone can fix its real name/location
    # later via PATCH /api/cameras/{id} (or just re-seed with the right ID).
    camera = db.query(Camera).filter(Camera.id == payload.camera_id).first()
    if camera is None:
        camera = Camera(
            id=payload.camera_id,
            name=f"Unregistered camera ({payload.camera_id})",
            department="Unknown",
            lat=23.0225,   # Ahmedabad city-centre placeholder - fix once real location is known
            lng=72.5714,
            status="online",
            vendor=None,
        )
        db.add(camera)
        db.flush()
        print(f"[backend] Auto-registered unknown camera_id='{payload.camera_id}' "
              f"with placeholder location - update it via PATCH /api/cameras/{payload.camera_id} "
              f"or fix the camera_id in your AI script to match an existing seeded camera.")

    # ── New sighting ───────────────────────────────────────────────────────────
    sighting_id = str(uuid.uuid4())

    # Handle evidence image before we know the URL
    evidence_url: Optional[str] = None
    if payload.evidence_image_base64:
        try:
            img_bytes = base64.b64decode(payload.evidence_image_base64)
            img_path = EVIDENCE_DIR / f"{sighting_id}.jpg"
            img_path.write_bytes(img_bytes)
            evidence_url = f"/static/evidence/{sighting_id}.jpg"
        except Exception:
            evidence_url = None  # don't crash if image is malformed

    db_sighting = VehicleSighting(
        id=sighting_id,
        camera_id=payload.camera_id,
        track_id=str(payload.track_id) if payload.track_id is not None else None,
        vehicle_type=payload.vehicle_type,
        plate_number=norm_plate,
        vehicle_confidence=payload.vehicle_confidence,
        plate_confidence=payload.plate_confidence,
        ocr_confidence=payload.ocr_confidence,
        system_confidence=payload.system_confidence,
        bbox=payload.bbox,
        video_timestamp=payload.video_timestamp,
        detected_at=now,
        evidence_frame_url=evidence_url,
    )
    db.add(db_sighting)
    db.flush()  # get db_sighting.id without full commit

    CHAR_CONFUSIONS = {
        "0": "0", "O": "0",
        "1": "1", "I": "1",
        "5": "5", "S": "5",
        "8": "8", "B": "8",
        "2": "2", "Z": "2",
        "3": "3", "J": "3",
    }

    def _confusion_normalize(plate: str) -> str:
        """Collapse commonly-confused OCR character pairs to ONE canonical
        representative (e.g. both '3' and 'J' become '3'), so two readings
        that differ only by a known confusion become identical strings.
        Used ONLY for watchlist matching - never overwrites the stored
        plate_number."""
        return "".join(CHAR_CONFUSIONS.get(c, c) for c in plate)


    def _is_probable_match(a: str, b: str, max_distance: int = 1) -> bool:
        return Levenshtein.distance(_confusion_normalize(a), _confusion_normalize(b)) <= max_distance

    active_vehicles = (
        db.query(WatchlistEntity)
        .filter(WatchlistEntity.entity_type == "vehicle", WatchlistEntity.status == "active")
        .all()
    )

    watchlist_entry = None
    match_type = None
    for candidate in active_vehicles:
        if candidate.plate_number == norm_plate:
            watchlist_entry = candidate
            match_type = "exact"
            break

    if watchlist_entry is None:
        for candidate in active_vehicles:
            if _is_probable_match(norm_plate, candidate.plate_number):
                watchlist_entry = candidate
                match_type = "possible"
                break
    
    
    alert_row = None
    if watchlist_entry:
        db_sighting.watchlist_match_id = watchlist_entry.id

        # Camera is guaranteed to exist now (either it was already
        # registered, or we just auto-registered a stub above).
        cam_name = camera.name

        if match_type == "exact":
            message = f"{watchlist_entry.category.upper()} vehicle detected on {cam_name}"
        else:
            message = (f"POSSIBLE MATCH — OCR read '{norm_plate}', which is close to watchlist "
                       f"plate '{watchlist_entry.plate_number}' ({watchlist_entry.category}). "
                       f"Verify before treating as confirmed.")

        alert_row = Alert(
            id=str(uuid.uuid4()),
            watchlist_id=watchlist_entry.id,
            vehicle_sighting_id=sighting_id,
            priority=watchlist_entry.priority,
            status="new",
            created_at=now,
            camera_name=cam_name,
            plate_number=norm_plate,
            category=watchlist_entry.category,
            match_type=match_type,
            matched_plate=watchlist_entry.plate_number,
        )
        db.add(alert_row)

    db.commit()
    db.refresh(db_sighting)

    return {
        "sighting_id": db_sighting.id,
        "plate_number": norm_plate,
        "watchlist_match": watchlist_entry is not None,
        "alert_id": alert_row.id if alert_row else None,
        "alert": {
            "status": alert_row.status,
            "priority": alert_row.priority,
            "match_type": alert_row.match_type,
            "matched_plate": alert_row.matched_plate,
            "message": message,
        } if alert_row else None,
    }


# ─── Legacy v1 endpoints (kept for backward compatibility) ────────────────────

@app.get("/api/v1/alerts")
def legacy_alerts(db: Session = Depends(get_db)):
    rows = db.query(Alert).order_by(desc(Alert.created_at)).limit(50).all()
    return [AlertOut.from_orm_row(r) for r in rows]


@app.get("/api/v1/vehicles/{plate_number}")
def legacy_search_vehicle(plate_number: str, db: Session = Depends(get_db)):
    norm = _norm_plate(plate_number)
    rows = (
        db.query(VehicleSighting)
        .filter(VehicleSighting.plate_number == norm)
        .order_by(desc(VehicleSighting.detected_at))
        .all()
    )
    return [VehicleSightingOut.from_orm_row(r) for r in rows]


@app.get("/api/v1/watchlist")
def legacy_list_watchlist(db: Session = Depends(get_db)):
    rows = db.query(WatchlistEntity).all()
    return [WatchlistEntityOut.from_orm_row(r) for r in rows]