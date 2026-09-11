"""
IVMAP Backend

Run from inside backend/:
    uvicorn app.main:app --reload

Docs/test UI: http://127.0.0.1:8000/docs
"""

from fastapi import FastAPI, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import desc

from .database import Base, engine, get_db
from .models import Watchlist, VehicleSighting, Alert
from .schemas import VehicleSightingCreate, AlertOut, SightingOut

app = FastAPI(title="IVMAP Backend", version="1.0.0")
Base.metadata.create_all(bind=engine)


@app.get("/")
def root():
    return {"system": "IVMAP", "status": "running"}


@app.post("/api/v1/sightings")
def create_sighting(sighting: VehicleSightingCreate, db: Session = Depends(get_db)):
    """Store sighting -> check watchlist -> create alert if matched."""
    db_sighting = VehicleSighting(
        camera_id=sighting.camera_id,
        track_id=sighting.track_id,
        vehicle_type=sighting.vehicle_type,
        plate_number=sighting.plate_number.upper(),
        vehicle_confidence=sighting.vehicle_confidence,
        plate_confidence=sighting.plate_confidence,
        ocr_confidence=sighting.ocr_confidence,
        system_confidence=sighting.system_confidence,
        bbox=sighting.bbox,
        video_timestamp=sighting.video_timestamp,
    )
    db.add(db_sighting)
    db.commit()
    db.refresh(db_sighting)

    watchlist_entry = db.query(Watchlist).filter(
        Watchlist.plate_number == sighting.plate_number.upper()
    ).first()

    alert = None
    if watchlist_entry:
        alert = Alert(
            sighting_id=db_sighting.id,
            plate_number=sighting.plate_number.upper(),
            alert_type="WATCHLIST_MATCH",
            status=watchlist_entry.status,
            priority=watchlist_entry.priority,
            message=f"{watchlist_entry.status} vehicle detected on {sighting.camera_id}",
        )
        db.add(alert)
        db.commit()
        db.refresh(alert)

    return {
        "sighting_id": db_sighting.id,
        "plate_number": sighting.plate_number.upper(),
        "watchlist_match": watchlist_entry is not None,
        "alert_id": alert.id if alert else None,
        "alert": {
            "status": alert.status,
            "priority": alert.priority,
            "message": alert.message,
        } if alert else None,
    }


@app.get("/api/v1/alerts", response_model=list[AlertOut])
def get_alerts(db: Session = Depends(get_db)):
    return db.query(Alert).order_by(desc(Alert.created_at)).limit(50).all()


@app.get("/api/v1/vehicles/{plate_number}", response_model=list[SightingOut])
def search_vehicle(plate_number: str, db: Session = Depends(get_db)):
    return db.query(VehicleSighting).filter(
        VehicleSighting.plate_number == plate_number.upper()
    ).order_by(desc(VehicleSighting.created_at)).all()


@app.get("/api/v1/watchlist")
def list_watchlist(db: Session = Depends(get_db)):
    return db.query(Watchlist).all()


@app.post("/api/v1/watchlist")
def add_watchlist_entry(plate_number: str, status: str, priority: str,
                          description: str = "", db: Session = Depends(get_db)):
    existing = db.query(Watchlist).filter(
        Watchlist.plate_number == plate_number.upper()
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Plate already on watchlist")

    entry = Watchlist(
        plate_number=plate_number.upper(),
        status=status,
        priority=priority,
        description=description,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry
