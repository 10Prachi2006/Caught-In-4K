"""
Seeds the watchlist. Run from inside backend/:
    python seed.py

IMPORTANT: add your test video's ACTUAL detected plate here (copy exactly
from run_video.py's console output) or your demo alert won't fire.
"""

from app.database import SessionLocal, Base, engine
from app.models import Watchlist

Base.metadata.create_all(bind=engine)

db = SessionLocal()

vehicles = [
    Watchlist(
        plate_number="AVU8HVF",
        status="STOLEN",
        priority="CRITICAL",
        description="Demo stolen vehicle",
    ),
    Watchlist(
        plate_number="GJ05CD5678",
        status="WANTED",
        priority="HIGH",
        description="Demo wanted vehicle",
    ),
    # <-- your actual test footage's plate, e.g.:
    Watchlist(
        plate_number="GXIS0GJ",
        status="STOLEN",
        priority="CRITICAL",
        description="Demo - matches test footage",
    ),
]

for vehicle in vehicles:
    existing = db.query(Watchlist).filter(
        Watchlist.plate_number == vehicle.plate_number
    ).first()
    if not existing:
        db.add(vehicle)

db.commit()
db.close()
print("Watchlist seeded successfully.")
