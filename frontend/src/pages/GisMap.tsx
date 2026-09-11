import { AlertTriangle } from 'lucide-react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useState } from 'react';
import { MapContainer, Marker, Popup, TileLayer } from 'react-leaflet';
import { getGisAlerts, getGisCameras } from '../lib/api';
import type { Alert, Camera } from '../types';
import { useTheme } from '../lib/ThemeContext';
import { ACCENT_GREEN, ACCENT_RED, ACCENT_AMBER, ACCENT_BLUE, ACCENT_SLATE } from '../lib/theme-colors';
import { getTileUrl, TILE_ATTRIBUTION } from '../lib/map-tiles';

// Fix Leaflet icons
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

function cameraMarkerIcon(online: boolean) {
  const color = online ? ACCENT_GREEN : ACCENT_RED;
  const glow = online ? 'rgba(34,211,165,0.5)' : 'rgba(240,68,68,0.5)';
  return L.divIcon({
    html: `
      <div style="position:relative;display:flex;align-items:center;justify-content:center;">
        <div style="width:14px;height:14px;border-radius:50%;background:${color};border:2px solid rgba(255,255,255,0.5);box-shadow:0 0 10px ${glow}"></div>
      </div>`,
    className: '',
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });
}

const PRIORITY_COLORS: Record<string, string> = {
  critical: ACCENT_RED,
  high: ACCENT_AMBER,
  medium: ACCENT_BLUE,
  low: ACCENT_SLATE,
};

function alertMarkerIcon(priority: string) {
  const color = PRIORITY_COLORS[priority] ?? ACCENT_SLATE;
  return L.divIcon({
    html: `
      <div style="width:20px;height:20px;transform:rotate(45deg);background:${color};border:2px solid rgba(255,255,255,0.4);border-radius:2px;box-shadow:0 0 12px ${color}66"></div>`,
    className: '',
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  });
}

// Legend data using constants
const CAMERA_LEGEND = [
  { color: ACCENT_GREEN, label: 'Camera Online' },
  { color: ACCENT_RED,   label: 'Camera Offline' },
];
const ALERT_LEGEND = [
  { color: ACCENT_RED,   label: 'Critical Alert' },
  { color: ACCENT_AMBER, label: 'High Alert' },
  { color: ACCENT_BLUE,  label: 'Medium Alert' },
];

export function GisMap() {
  const { theme } = useTheme();
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([getGisCameras(), getGisAlerts()])
      .then(([cams, als]) => {
        setCameras(cams);
        setAlerts(als);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to load map data:', err);
        setError('Failed to load map data. Please check your connection and try again.');
        setLoading(false);
      });
  }, []);

  const mapCenter: [number, number] = [22.5, 72.5];
  const tileUrl = getTileUrl(theme);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, height: '100%' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, letterSpacing: '-0.02em' }}>
            GIS Map
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem', margin: '4px 0 0' }}>
            Live camera network across Gujarat
          </p>
        </div>
        {/* Legend */}
        <div
          className="card"
          style={{ padding: '10px 16px', display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}
        >
          <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
            Legend
          </div>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            {CAMERA_LEGEND.map(({ color, label }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.72rem' }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: color }} />
                <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
              </div>
            ))}
            {ALERT_LEGEND.map(({ color, label }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.72rem' }}>
                <div style={{ width: 10, height: 10, transform: 'rotate(45deg)', background: color, borderRadius: 1 }} />
                <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Full-size map */}
      <div
        className="card"
        style={{
          flex: 1,
          padding: 0,
          overflow: 'hidden',
          minHeight: 'min(500px, 50vh)',
        }}
      >
        {loading ? (
          <div
            style={{
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text-muted)',
              fontSize: '0.85rem',
            }}
          >
            Loading map data…
          </div>
        ) : error ? (
          <div
            style={{
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 12,
              padding: 20,
            }}
          >
            <AlertTriangle size={40} color="var(--accent-red)" strokeWidth={1.2} />
            <div style={{ color: 'var(--text-primary)', fontSize: '0.9rem', fontWeight: 600 }}>
              {error}
            </div>
            <button
              className="btn btn-primary"
              onClick={() => window.location.reload()}
              style={{ marginTop: 8 }}
            >
              Retry
            </button>
          </div>
        ) : (
          <MapContainer
            center={mapCenter}
            zoom={7}
            style={{ height: '100%', width: '100%', minHeight: 'min(500px, 50vh)' }}
          >
            <TileLayer
              key={tileUrl}
              url={tileUrl}
              attribution={TILE_ATTRIBUTION}
            />

            {/* Camera markers */}
            {cameras.map((cam) => (
              <Marker
                key={cam.id}
                position={[cam.lat, cam.lng]}
                icon={cameraMarkerIcon(cam.status === 'online')}
              >
                <Popup>
                  <div style={{ fontSize: 12, minWidth: 180 }}>
                    <div style={{ fontWeight: 700, marginBottom: 6, fontSize: 13 }}>
                      {cam.name}
                    </div>
                    <div style={{ color: 'var(--text-secondary)', marginBottom: 4 }}>
                      {cam.department}
                    </div>
                    {cam.vendor && (
                      <div style={{ color: 'var(--text-muted)', fontSize: 11, marginBottom: 6 }}>
                        Vendor: {cam.vendor}
                      </div>
                    )}
                    <span className={`badge badge-${cam.status}`}>{cam.status}</span>
                  </div>
                </Popup>
              </Marker>
            ))}

            {/* Alert markers — offset slightly so they don't overlap cameras */}
            {alerts.map((alert) => {
              const cam = cameras.find((c) => c.name === alert.cameraName);
              if (!cam) return null;
              return (
                <Marker
                  key={alert.id}
                  position={[cam.lat + 0.05, cam.lng + 0.05]}
                  icon={alertMarkerIcon(alert.priority)}
                >
                  <Popup>
                    <div style={{ fontSize: 12, minWidth: 200 }}>
                      <div style={{ fontWeight: 700, marginBottom: 6, fontSize: 13 }}>
                        Alert: {alert.plateNumber}
                      </div>
                      <div style={{ color: 'var(--text-secondary)', marginBottom: 4 }}>
                        {alert.cameraName}
                      </div>
                      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                        <span className={`badge badge-${alert.priority}`}>{alert.priority}</span>
                        <span className={`badge badge-${alert.status}`}>{alert.status}</span>
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
                        Category: {alert.category}
                      </div>
                    </div>
                  </Popup>
                </Marker>
              );
            })}
          </MapContainer>
        )}
      </div>

      {/* Summary strip */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <div className="card" style={{ flex: 1, padding: '12px 16px', minWidth: 100 }}>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Total Cameras</div>
          <div style={{ fontSize: '1.4rem', fontWeight: 700 }}>{cameras.length}</div>
        </div>
        <div className="card" style={{ flex: 1, padding: '12px 16px', minWidth: 100 }}>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Online</div>
          <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--accent-green)' }}>
            {cameras.filter((c) => c.status === 'online').length}
          </div>
        </div>
        <div className="card" style={{ flex: 1, padding: '12px 16px', minWidth: 100 }}>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Offline</div>
          <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--accent-red)' }}>
            {cameras.filter((c) => c.status === 'offline').length}
          </div>
        </div>
        <div className="card" style={{ flex: 1, padding: '12px 16px', minWidth: 100 }}>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Active Alerts</div>
          <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--accent-amber)' }}>
            {alerts.length}
          </div>
        </div>
      </div>
    </div>
  );
}
