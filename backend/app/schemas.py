"""
IVMAP — Pydantic schemas (v2).

Response models match frontend/src/types/index.ts exactly:
  - camelCase field names via model_config + alias
  - id fields are always str
  - dates are ISO 8601 strings
  - confidence floats in 0-1 range
"""

from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field


# ─── helpers ──────────────────────────────────────────────────────────────────

def _iso(dt: Optional[datetime]) -> Optional[str]:
    """Convert a UTC datetime to ISO 8601 with Z suffix."""
    if dt is None:
        return None
    return dt.isoformat() + "Z"


# ─── Camera ───────────────────────────────────────────────────────────────────

class CameraOut(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: str
    name: str
    department: str
    lat: float
    lng: float
    status: str
    vendor: Optional[str] = None


# ─── VehicleSighting ──────────────────────────────────────────────────────────

class VehicleSightingOut(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: str
    # frontend calls this 'vehicleId' — we use plate as a stable vehicle id
    vehicleId: str = Field(alias="vehicleId")
    plateNumber: str = Field(alias="plateNumber")
    cameraId: str = Field(alias="cameraId")
    detectedAt: str = Field(alias="detectedAt")
    ocrConfidence: float = Field(alias="ocrConfidence")
    detectionConfidence: float = Field(alias="detectionConfidence")
    combinedConfidence: float = Field(alias="combinedConfidence")
    evidenceFrameUrl: str = Field(alias="evidenceFrameUrl", default="")
    watchlistMatchId: Optional[str] = Field(alias="watchlistMatchId", default=None)

    @classmethod
    def from_orm_row(cls, row) -> "VehicleSightingOut":
        return cls(
            id=row.id,
            vehicleId=row.plate_number or "",
            plateNumber=row.plate_number or "",
            cameraId=row.camera_id,
            detectedAt=_iso(row.detected_at) or "",
            ocrConfidence=row.ocr_confidence or 0.0,
            detectionConfidence=row.vehicle_confidence or 0.0,
            combinedConfidence=row.system_confidence or 0.0,
            evidenceFrameUrl=row.evidence_frame_url or "",
            watchlistMatchId=row.watchlist_match_id,
        )


# ─── WatchlistEntity ──────────────────────────────────────────────────────────

class WatchlistEntityOut(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: str
    entityType: str = Field(alias="entityType")
    category: str
    priority: str
    status: str
    referenceNo: str = Field(alias="referenceNo")
    description: str
    plateNumber: Optional[str] = Field(alias="plateNumber", default=None)

    @classmethod
    def from_orm_row(cls, row) -> "WatchlistEntityOut":
        return cls(
            id=row.id,
            entityType=row.entity_type,
            category=row.category,
            priority=row.priority,
            status=row.status,
            referenceNo=row.reference_no,
            description=row.description or "",
            plateNumber=row.plate_number,
        )


# ─── Alert ────────────────────────────────────────────────────────────────────

class AlertOut(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: str
    watchlistId: str = Field(alias="watchlistId")
    vehicleSightingId: str = Field(alias="vehicleSightingId")
    priority: str
    status: str
    createdAt: str = Field(alias="createdAt")
    cameraName: str = Field(alias="cameraName")
    plateNumber: str = Field(alias="plateNumber")
    category: str
    matchType: str = Field(alias="matchType", default="exact")
    matchedPlate: Optional[str] = Field(alias="matchedPlate", default=None)

    @classmethod
    def from_orm_row(cls, row) -> "AlertOut":
        return cls(
            id=row.id,
            watchlistId=row.watchlist_id,
            vehicleSightingId=row.vehicle_sighting_id,
            priority=row.priority,
            status=row.status,
            createdAt=_iso(row.created_at) or "",
            cameraName=row.camera_name,
            plateNumber=row.plate_number,
            category=row.category,
            matchType=getattr(row, "match_type", "exact") or "exact",
            matchedPlate=getattr(row, "matched_plate", None),
        )


# ─── DashboardSummary ─────────────────────────────────────────────────────────

class DashboardSummaryOut(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    totalCameras: int = Field(alias="totalCameras")
    camerasOnline: int = Field(alias="camerasOnline")
    camerasOffline: int = Field(alias="camerasOffline")
    activeAlerts: int = Field(alias="activeAlerts")
    vehiclesTrackedToday: int = Field(alias="vehiclesTrackedToday")
    criticalIncidents: int = Field(alias="criticalIncidents")
    systemHealth: str = Field(alias="systemHealth")


# ─── AI ingestion request (contract frozen — AI team must not change) ─────────

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
    # Optional — AI script doesn't send this yet; adding it is non-breaking
    evidence_image_base64: Optional[str] = None


# ─── Alert PATCH request ──────────────────────────────────────────────────────

class AlertStatusUpdate(BaseModel):
    status: str  # 'acknowledged' | 'resolved'