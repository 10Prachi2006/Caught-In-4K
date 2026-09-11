// IVMAP — TypeScript interfaces mirroring the real (future) DB schema
// Field names are kept identical so the real API maps 1:1 later

export interface Camera {
  id: string;
  name: string;
  department: string;
  lat: number;
  lng: number;
  status: 'online' | 'offline';
  vendor?: string;
}

export interface VehicleSighting {
  id: string;
  vehicleId: string;
  plateNumber: string;
  cameraId: string;
  detectedAt: string; // ISO 8601
  ocrConfidence: number; // 0–1
  detectionConfidence: number; // 0–1
  combinedConfidence: number; // 0–1
  evidenceFrameUrl: string;
  watchlistMatchId?: string;
}

export interface WatchlistEntity {
  id: string;
  entityType: 'vehicle' | 'person';
  category: 'stolen' | 'blacklisted' | 'wanted' | 'missing' | 'suspect' | 'other';
  priority: 'low' | 'medium' | 'high' | 'critical';
  status: 'active' | 'resolved' | 'expired';
  referenceNo: string;
  description: string;
  plateNumber?: string;
}

export interface Alert {
  id: string;
  watchlistId: string;
  vehicleSightingId: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  status: 'new' | 'acknowledged' | 'resolved';
  createdAt: string; // ISO 8601
  cameraName: string;
  plateNumber: string;
  category: string;
}

export interface DashboardSummary {
  totalCameras: number;
  camerasOnline: number;
  camerasOffline: number;
  activeAlerts: number;
  vehiclesTrackedToday: number;
  criticalIncidents: number;
  systemHealth: 'healthy' | 'degraded';
}
