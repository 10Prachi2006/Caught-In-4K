"""The 3 core tables: watchlist, vehicle_sightings, alerts."""

from datetime import datetime
from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, JSON
from .database import Base


class Watchlist(Base):
    __tablename__ = "watchlist"

    id = Column(Integer, primary_key=True)
    plate_number = Column(String(20), unique=True, index=True, nullable=False)
    status = Column(String(30), nullable=False)
    priority = Column(String(20), nullable=False)
    description = Column(String(255))
    created_at = Column(DateTime, default=datetime.utcnow)


class VehicleSighting(Base):
    __tablename__ = "vehicle_sightings"

    id = Column(Integer, primary_key=True)
    camera_id = Column(String(50), index=True, nullable=False)
    track_id = Column(Integer)
    vehicle_type = Column(String(30))
    plate_number = Column(String(20), index=True)
    vehicle_confidence = Column(Float)
    plate_confidence = Column(Float)
    ocr_confidence = Column(Float)
    system_confidence = Column(Float)
    bbox = Column(JSON)
    video_timestamp = Column(String(30))
    created_at = Column(DateTime, default=datetime.utcnow)


class Alert(Base):
    __tablename__ = "alerts"

    id = Column(Integer, primary_key=True)
    sighting_id = Column(Integer, ForeignKey("vehicle_sightings.id"))
    plate_number = Column(String(20))
    alert_type = Column(String(50))
    status = Column(String(30))
    priority = Column(String(20))
    message = Column(String(255))
    created_at = Column(DateTime, default=datetime.utcnow)
