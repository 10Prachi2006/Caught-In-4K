"""The JSON contract between AI and backend."""

from typing import Optional, List
from pydantic import BaseModel


class VehicleSightingCreate(BaseModel):
    camera_id: str
    track_id: Optional[int] = None
    vehicle_type: str
    plate_number: str
    vehicle_confidence: float
    plate_confidence: float
    ocr_confidence: float
    system_confidence: float
    bbox: Optional[List[int]] = None
    video_timestamp: str


class AlertOut(BaseModel):
    id: int
    plate_number: str
    alert_type: str
    status: str
    priority: str
    message: str

    class Config:
        from_attributes = True


class SightingOut(BaseModel):
    id: int
    camera_id: str
    track_id: Optional[int]
    vehicle_type: Optional[str]
    plate_number: Optional[str]
    vehicle_confidence: Optional[float]
    plate_confidence: Optional[float]
    ocr_confidence: Optional[float]
    system_confidence: Optional[float]
    bbox: Optional[list]
    video_timestamp: Optional[str]

    class Config:
        from_attributes = True
