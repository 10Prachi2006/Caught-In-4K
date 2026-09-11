// IVMAP — API layer (real implementation)
// All functions call the real backend API via fetch()

import type { Camera, VehicleSighting, Alert, DashboardSummary } from '../../types';

// ─── API Configuration ────────────────────────────────────────────────────────

const BASE_URL = import.meta.env.VITE_API_BASE_URL;

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) throw new Error(`Request failed: ${res.status} ${path}`);
  return res.json();
}

// ─── API Functions ────────────────────────────────────────────────────────────

export async function getDashboardSummary(): Promise<DashboardSummary> {
  return apiFetch<DashboardSummary>('/api/dashboard/summary');
}

export async function getRecentAlerts(limit: number): Promise<Alert[]> {
  return apiFetch<Alert[]>(`/api/alerts?limit=${limit}`);
}

export async function getCameraStatuses(): Promise<Camera[]> {
  return apiFetch<Camera[]>('/api/cameras/status');
}

export async function getCameras(): Promise<Camera[]> {
  return apiFetch<Camera[]>('/api/cameras');
}

export async function getVehicleSightings(plate: string): Promise<VehicleSighting[]> {
  return apiFetch<VehicleSighting[]>(`/api/vehicles/${encodeURIComponent(plate)}/sightings`);
}

export async function getVehicleRoute(plate: string): Promise<{ camera: Camera; sighting: VehicleSighting }[]> {
  return apiFetch(`/api/vehicles/${encodeURIComponent(plate)}/route`);
}

export async function getAlerts(filters?: { priority?: string; status?: string }): Promise<Alert[]> {
  const params = new URLSearchParams();
  if (filters?.priority && filters.priority !== 'all') params.set('priority', filters.priority);
  if (filters?.status && filters.status !== 'all') params.set('status', filters.status);
  const qs = params.toString();
  return apiFetch<Alert[]>(`/api/alerts${qs ? `?${qs}` : ''}`);
}

export async function updateAlertStatus(id: string, status: 'acknowledged' | 'resolved'): Promise<Alert> {
  return apiFetch<Alert>(`/api/alerts/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

export async function getGisCameras(): Promise<Camera[]> {
  return apiFetch<Camera[]>('/api/gis/cameras');
}

export async function getGisAlerts(): Promise<Alert[]> {
  return apiFetch<Alert[]>('/api/gis/alerts');
}

export async function getRecentDetections(limit = 8): Promise<VehicleSighting[]> {
  return apiFetch<VehicleSighting[]>(`/api/detections/recent?limit=${limit}`);
}

export async function getWatchlistEntity(id: string) {
  return apiFetch(`/api/watchlist/${id}`);
}

export async function getCameraById(id: string): Promise<Camera | null> {
  return apiFetch<Camera | null>(`/api/cameras/${id}`);
}

// Note: getSightingById has no endpoint defined in the API contract
// This function is still exported for backward compatibility but may fail
// If needed, coordinate with backend team to add this endpoint
export async function getSightingById(id: string): Promise<VehicleSighting | null> {
  try {
    return await apiFetch<VehicleSighting | null>(`/api/sightings/${id}`);
  } catch (err) {
    console.warn('getSightingById not implemented in backend:', err);
    return null;
  }
}
