import { AlertTriangle, Camera, Clock, Search, XCircle } from 'lucide-react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useState } from 'react';
import { MapContainer, Marker, Polyline, Popup, TileLayer } from 'react-leaflet';
import { getVehicleRoute, getVehicleSightings } from '../lib/api';
import type { Camera as CameraType, VehicleSighting } from '../types';
import { formatDateTime, formatDistanceToNow } from '../utils/time';
import { useTheme } from '../lib/ThemeContext';
import { ACCENT_BLUE, ON_ACCENT } from '../lib/theme-colors';
import { getTileUrl, TILE_ATTRIBUTION } from '../lib/map-tiles';

// Fix Leaflet icons
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

function numberedIcon(n: number) {
  return L.divIcon({
    html: `<div style="width:22px;height:22px;border-radius:50%;background:${ACCENT_BLUE};border:2px solid rgba(255,255,255,0.4);display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:${ON_ACCENT};box-shadow:0 0 10px rgba(56,189,248,0.5)">${n}</div>`,
    className: '',
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
}

function confidenceColor(conf: number) {
  if (conf >= 0.9) return 'var(--accent-green)';
  if (conf >= 0.75) return 'var(--accent-blue)';
  if (conf >= 0.6) return 'var(--accent-amber)';
  return 'var(--accent-red)';
}

function ConfidenceBar({ value, label }: { value: number; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', width: 60, flexShrink: 0 }}>
        {label}
      </span>
      <div className="conf-bar-bg" style={{ flex: 1 }}>
        <div
          className="conf-bar-fill"
          style={{ width: `${value * 100}%`, background: confidenceColor(value) }}
        />
      </div>
      <span
        style={{
          fontSize: '0.68rem',
          fontWeight: 600,
          color: confidenceColor(value),
          width: 32,
          textAlign: 'right',
          flexShrink: 0,
        }}
      >
        {Math.round(value * 100)}%
      </span>
    </div>
  );
}

export function VehicleSearch() {
  const { theme } = useTheme();
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sightings, setSightings] = useState<VehicleSighting[]>([]);
  const [route, setRoute] = useState<{ camera: CameraType; sighting: VehicleSighting }[]>([]);

  const tileUrl = getTileUrl(theme);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setSearching(true);
    setSearched(false);
    setError(null);
    try {
      const [s, r] = await Promise.all([
        getVehicleSightings(query),
        getVehicleRoute(query),
      ]);
      setSightings(s);
      setRoute(r);
      setSearched(true);
    } catch (err) {
      console.error('Search failed:', err);
      setError('Failed to search for vehicle. Please check your connection and try again.');
    } finally {
      setSearching(false);
    }
  };

  const mapCenter: [number, number] =
    route.length > 0 ? [route[0].camera.lat, route[0].camera.lng] : [22.5, 72.5];

  const polylinePositions: [number, number][] = route.map((r) => [r.camera.lat, r.camera.lng]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Header */}
      <div>
        <h1 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, letterSpacing: '-0.02em' }}>
          Vehicle Search
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem', margin: '4px 0 0' }}>
          Cross-camera route reconstruction by registration number
        </p>
      </div>

      {/* Search bar */}
      <div className="card" style={{ padding: '18px 20px' }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <Search
              size={15}
              style={{
                position: 'absolute',
                left: 12,
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-muted)',
              }}
            />
            <input
              id="plate-search-input"
              className="input"
              style={{ paddingLeft: 36 }}
              placeholder="Enter registration number — e.g. GJ01AB1234"
              value={query}
              onChange={(e) => setQuery(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            />
          </div>
          <button
            id="plate-search-btn"
            className="btn btn-primary"
            onClick={handleSearch}
            disabled={searching || !query.trim()}
            style={{ padding: '9px 20px', opacity: searching ? 0.6 : 1 }}
          >
            {searching ? 'Searching…' : 'Search'}
          </button>
        </div>
        <div style={{ marginTop: 8, fontSize: '0.72rem', color: 'var(--text-muted)' }}>
          Try{' '}
          {['GJ01AB1234', 'GJ05CD5678', 'GJ15GH3456'].map((p) => (
            <button
              key={p}
              onClick={() => setQuery(p)}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--accent-blue)',
                cursor: 'pointer',
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: '0.72rem',
                padding: '0 4px',
                textDecoration: 'underline',
              }}
            >
              {p}
            </button>
          ))}{' '}
          for a multi-camera demo
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div
          className="card"
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 12,
            padding: '48px 20px',
          }}
        >
          <AlertTriangle size={40} color="var(--accent-red)" strokeWidth={1.2} />
          <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
            {error}
          </div>
          <button
            className="btn btn-primary"
            onClick={handleSearch}
            style={{ marginTop: 8 }}
          >
            Try Again
          </button>
        </div>
      )}

      {/* Results */}
      {searched && sightings.length === 0 && !error && (
        <div
          className="card"
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 12,
            padding: '48px 20px',
          }}
        >
          <XCircle size={40} color="var(--text-muted)" strokeWidth={1.2} />
          <div style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>
            No sightings found for{' '}
            <span style={{ fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-primary)' }}>
              {query}
            </span>
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            This plate has not been detected in the last 24 hours.
          </div>
        </div>
      )}

      {searched && sightings.length > 0 && !error && (
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          {/* Sighting timeline */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <span style={{ fontWeight: 600, fontSize: '0.88rem' }}>
                Sighting Timeline
              </span>
              <span className={`badge badge-${sightings[0].watchlistMatchId ? 'critical' : 'medium'}`}>
                {sightings.length} detection{sightings.length !== 1 ? 's' : ''}
              </span>
            </div>

            {sightings[0].watchlistMatchId && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '10px 14px',
                  borderRadius: 8,
                  background: 'var(--accent-red-dim)',
                  border: '1px solid rgba(240,68,68,0.25)',
                  fontSize: '0.78rem',
                  color: 'var(--accent-red)',
                }}
              >
                <AlertTriangle size={14} />
                This vehicle is on the active watchlist
              </div>
            )}

            {sightings.map((s, idx) => (
              <div
                key={s.id}
                className="card animate-slide-up"
                style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: '50%',
                      background: 'var(--accent-blue-dim)',
                      border: '1px solid rgba(56,189,248,0.25)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 700,
                      fontSize: '0.75rem',
                      color: 'var(--accent-blue)',
                      flexShrink: 0,
                    }}
                  >
                    {idx + 1}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>
                      {route[idx]?.camera.name ?? s.cameraId}
                    </div>
                    <div
                      style={{
                        fontSize: '0.72rem',
                        color: 'var(--text-secondary)',
                        display: 'flex',
                        gap: 10,
                        marginTop: 2,
                      }}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Clock size={10} />
                        {formatDateTime(s.detectedAt)}
                      </span>
                      <span style={{ color: 'var(--text-muted)' }}>
                        {formatDistanceToNow(s.detectedAt)}
                      </span>
                    </div>
                  </div>
                  {/* Evidence thumbnail placeholder */}
                  <div
                    style={{
                      width: 72,
                      height: 48,
                      borderRadius: 6,
                      background: 'var(--bg-surface)',
                      border: '1px solid var(--border)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <Camera size={16} color="var(--text-muted)" strokeWidth={1.2} />
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <ConfidenceBar value={s.ocrConfidence} label="OCR" />
                  <ConfidenceBar value={s.detectionConfidence} label="Detection" />
                  <ConfidenceBar value={s.combinedConfidence} label="Combined" />
                </div>
              </div>
            ))}
          </div>

          {/* Route mini-map */}
          <div
            className="card"
            style={{ width: 380, flexShrink: 0, padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', minWidth: 0, flex: '1 1 320px' }}
          >
            <div style={{ padding: '14px 16px 10px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>Route Map</div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>
                Camera-to-camera path in time order
              </div>
            </div>
            <div style={{ flex: 1, minHeight: 'min(360px, 50vh)' }}>
              <MapContainer
                center={mapCenter}
                zoom={7}
                style={{ height: '100%', width: '100%', minHeight: 'min(360px, 50vh)' }}
                zoomControl={true}
              >
                <TileLayer
                  key={tileUrl}
                  url={tileUrl}
                  attribution={TILE_ATTRIBUTION}
                />
                {polylinePositions.length > 1 && (
                  <Polyline
                    positions={polylinePositions}
                    pathOptions={{ color: ACCENT_BLUE, weight: 2.5, dashArray: '6 4', opacity: 0.8 }}
                  />
                )}
                {route.map(({ camera }, idx) => (
                  <Marker
                    key={camera.id}
                    position={[camera.lat, camera.lng]}
                    icon={numberedIcon(idx + 1)}
                  >
                    <Popup>
                      <div style={{ fontSize: 12, minWidth: 160 }}>
                        <div style={{ fontWeight: 700, marginBottom: 4 }}>
                          Stop {idx + 1}: {camera.name}
                        </div>
                        <div style={{ color: 'var(--text-secondary)', fontSize: 11 }}>
                          {formatDateTime(route[idx].sighting.detectedAt)}
                        </div>
                      </div>
                    </Popup>
                  </Marker>
                ))}
              </MapContainer>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
