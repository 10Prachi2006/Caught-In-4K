"""
IVMAP seed script (v2).

Run from inside backend/:
    python seed.py

Seeds:
  - 2 cameras (cam01, cam02) near Ahmedabad / Gandhinagar
  - 4 watchlist_entities matching the team's real test-footage plates

Strategy: idempotent — skips rows that already exist by PK / plate.
"""

import sys
import os

sys.path.insert(0, os.path.dirname(__file__))

from app.database import SessionLocal, Base, engine
from app.models import Camera, WatchlistEntity

Base.metadata.create_all(bind=engine)
db = SessionLocal()


# ─── Cameras ──────────────────────────────────────────────────────────────────

CAMERAS = [
    Camera(
        id="cam01",
        name="SG Highway Junction — Ahmedabad",
        department="Traffic Police Ahmedabad",
        lat=23.0225,
        lng=72.5714,
        status="online",
        vendor="Hikvision",
    ),
    Camera(
        id="cam02",
        name="Gandhinagar Secretariat Gate",
        department="Gujarat State Intelligence Bureau",
        lat=23.2156,
        lng=72.6369,
        status="online",
        vendor="Dahua",
    ),
]

for cam in CAMERAS:
    if not db.get(Camera, cam.id):
        db.add(cam)
        print(f"  + Camera: {cam.id} — {cam.name}")
    else:
        print(f"  ✓ Camera already exists: {cam.id}")


# ─── Watchlist entities ───────────────────────────────────────────────────────
# IMPORTANT: keep every plate your test footage has actually produced in
# here, don't replace one with another - AVU8HVF and DL3CAM1234 are almost
# certainly from two DIFFERENT test videos/runs. Removing DL3CAM1234 to add
# AVU8HVF is why DLJCAM123 (which is close to DL3CAM1234) stopped matching -
# not a code bug, just missing test data.

WATCHLIST = [
    WatchlistEntity(
        entity_type="vehicle",
        category="stolen",
        priority="critical",
        status="active",
        reference_no="AHD-2024-STL-001",
        description="Stolen Maruti Suzuki Swift — reported missing 2024-01-15, owner Rajesh Patel",
        plate_number="DL3CAM1234",
    ),
    WatchlistEntity(
        entity_type="vehicle",
        category="stolen",
        priority="critical",
        status="active",
        reference_no="AHD-2024-STL-009",
        description="Stolen vehicle — demo plate matching test footage",
        plate_number="AVU8HVF",
    ),
    WatchlistEntity(
        entity_type="vehicle",
        category="wanted",
        priority="high",
        status="active",
        reference_no="GUJ-2024-WNT-042",
        description="Vehicle wanted in connection with highway robbery case — Anand district",
        plate_number="GJ05CD5678",
    ),
    WatchlistEntity(
        entity_type="vehicle",
        category="stolen",
        priority="critical",
        status="active",
        reference_no="AHD-2024-STL-007",
        description="Stolen Honda City — demo plate matching test footage, FIR filed 2024-03-10",
        plate_number="GXIS0GJ",
    ),
]

for entry in WATCHLIST:
    existing = (
        db.query(WatchlistEntity)
        .filter(
            WatchlistEntity.plate_number == entry.plate_number,
            WatchlistEntity.entity_type == "vehicle",
        )
        .first()
    )
    if not existing:
        db.add(entry)
        print(f"  + Watchlist: {entry.plate_number} ({entry.category}, {entry.priority})")
    else:
        print(f"  ✓ Watchlist already exists: {entry.plate_number}")


db.commit()
db.close()
print("\nSeed complete.")