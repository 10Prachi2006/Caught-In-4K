"""
IVMAP — SQLAlchemy models (v2 schema).

4 tables:
  cameras              – CCTV camera registry
  watchlist_entities   – vehicles/persons to flag
  vehicle_sightings    – every ANPR hit
  alerts               – raised when a sighting matches the watchlist

All PKs are stored as strings (UUIDs) so the frontend can use
encodeURIComponent() / string comparisons everywhere without mismatch.

Run from backend/:
    uvicorn app.main:app --reload
The DB file (ivmap.db) is created automatically on first run.
"""

import uuid
from datetime import datetime

from sqlalchemy import (
    Column, String, Float, DateTime, ForeignKey,
    JSON, Text, Boolean,
)
from .database import Base


def _uuid() -> str:
    return str(uuid.uuid4())


class Camera(Base):
    __tablename__ = "cameras"

    id = Column(String(50), primary_key=True, default=_uuid)
    name = Column(String(100), nullable=False)
    department = Column(String(100), nullable=False)
    lat = Column(Float, nullable=False)
    lng = Column(Float, nullable=False)
    # 'online' | 'offline'
    status = Column(String(20), nullable=False, default="online")
    vendor = Column(String(100), nullable=True)


class WatchlistEntity(Base):
    __tablename__ = "watchlist_entities"

    id = Column(String(36), primary_key=True, default=_uuid)
    # 'vehicle' | 'person'
    entity_type = Column(String(20), nullable=False, default="vehicle")
    # 'stolen' | 'blacklisted' | 'wanted' | 'missing' | 'suspect' | 'other'
    category = Column(String(30), nullable=False)
    # 'low' | 'medium' | 'high' | 'critical'
    priority = Column(String(20), nullable=False)
    # 'active' | 'resolved' | 'expired'
    status = Column(String(20), nullable=False, default="active")
    reference_no = Column(String(50), nullable=False)
    description = Column(Text, nullable=True)
    # uppercase-normalised plate — null for person entries
    plate_number = Column(String(30), nullable=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class VehicleSighting(Base):
    __tablename__ = "vehicle_sightings"

    id = Column(String(36), primary_key=True, default=_uuid)
    camera_id = Column(String(50), ForeignKey("cameras.id"), nullable=False, index=True)
    track_id = Column(String(50), nullable=True)       # stored as str (int from AI is cast)
    vehicle_type = Column(String(30), nullable=True)
    plate_number = Column(String(30), nullable=True, index=True)  # normalised uppercase
    vehicle_confidence = Column(Float, nullable=True)
    plate_confidence = Column(Float, nullable=True)
    ocr_confidence = Column(Float, nullable=True)
    system_confidence = Column(Float, nullable=True)
    bbox = Column(JSON, nullable=True)
    video_timestamp = Column(String(30), nullable=True)
    # Wall-clock time the sighting was ingested — used for route ordering & dedup
    detected_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    evidence_frame_url = Column(String(255), nullable=True)
    # FK set when the sighting matched a watchlist entry
    watchlist_match_id = Column(String(36), ForeignKey("watchlist_entities.id"), nullable=True)


class Alert(Base):
    __tablename__ = "alerts"

    id = Column(String(36), primary_key=True, default=_uuid)
    watchlist_id = Column(String(36), ForeignKey("watchlist_entities.id"), nullable=False)
    vehicle_sighting_id = Column(String(36), ForeignKey("vehicle_sightings.id"), nullable=False)
    # 'low' | 'medium' | 'high' | 'critical'
    priority = Column(String(20), nullable=False)
    # 'new' | 'acknowledged' | 'resolved'   ← separate from watchlist category
    status = Column(String(20), nullable=False, default="new")
    created_at = Column(DateTime, default=datetime.utcnow)
    resolved_at = Column(DateTime, nullable=True)
    # Denormalised at creation time so reads don't need extra joins
    camera_name = Column(String(100), nullable=False)
    plate_number = Column(String(30), nullable=False)
    category = Column(String(30), nullable=False)
    # 'exact' | 'possible' — 'possible' means OCR text was close-but-not-
    # identical to a watchlist plate (fuzzy/Levenshtein match) and should
    # be shown to an operator as "verify before acting", not auto-trusted.
    match_type = Column(String(20), nullable=False, default="exact")
    # The watchlist plate this was actually matched against - for 'exact'
    # this equals plate_number; for 'possible' it may differ (e.g. OCR
    # read DLJCAM123 but the watchlist plate is DL3CAM1234).
    matched_plate = Column(String(30), nullable=True)