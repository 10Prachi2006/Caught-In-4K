import {
  AlertTriangle,
  Camera,
  Car,
  CheckCircle2,
  Shield,
  Siren,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { MapContainer, Marker, Popup, TileLayer } from 'react-leaflet';
import { getDashboardSummary, getCameraStatuses, getRecentAlerts } from '../lib/api';
import type { Alert, Camera as CameraType, DashboardSummary } from '../types';
import { BentoCard, BentoGrid } from '../components/ui/BentoGrid';
import { formatDistanceToNow } from '../utils/time';
import { useTheme } from '../lib/ThemeContext';
import { ACCENT_GREEN, ACCENT_RED, ON_ACCENT } from '../lib/theme-colors';
import { getTileUrl, TILE_ATTRIBUTION } from '../lib/map-tiles';

// Fix Leaflet default marker icons in bundled environments
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// Custom colored circle markers
function cameraIcon(online: boolean) {
  const color = online ? ACCENT_GREEN : ACCENT_RED;
  void ON_ACCENT; // imported for consistency; unused in this marker
  return L.divIcon({
    html: `<div style="width:12px;height:12px;border-radius:50%;background:${color};border:2px solid rgba(255,255,255,0.4);box-shadow:0 0 8px ${color}"></div>`,
    className: '',
    iconSize: [12, 12],
    iconAnchor: [6, 6],
  });
}

interface KpiCardProps {
  label: string;
  value: number | string;
  icon: React.ElementType;
  accent?: string;
  sub?: string;
}

function KpiCard({ label, value, icon: Icon, accent = 'var(--text-primary)', sub }: KpiCardProps) {
  return (
    <BentoCard span="1x1">
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
            {label}
          </span>
          <div
            style={{
              padding: 6,
              borderRadius: 7,
              background: 'rgba(255,255,255,0.05)',
            }}
          >
            <Icon size={14} color={accent} strokeWidth={2} />
          </div>
        </div>
        <div className="kpi-number" style={{ color: accent }}>
          {value}
        </div>
        {sub && (
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 'auto' }}>
            {sub}
          </div>
        )}
      </div>
    </BentoCard>
  );
}

function priorityBadge(priority: string) {
  return <span className={`badge badge-${priority}`}>{priority}</span>;
}

export function Dashboard() {
  const { theme } = useTheme();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [cameras, setCameras] = useState<CameraType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const tileUrl = getTileUrl(theme);

  useEffect(() => {
    Promise.all([getDashboardSummary(), getRecentAlerts(5), getCameraStatuses()])
      .then(([sum, al, cams]) => {
        setSummary(sum);
        setAlerts(al);
        setCameras(cams);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to load dashboard:', err);
        setError('Failed to load dashboard data. Please check your connection and try again.');
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '60vh',
          color: 'var(--text-muted)',
          fontSize: '0.85rem',
        }}
      >
        Loading dashboard…
      </div>
    );
  }

  if (error) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '60vh',
          gap: 12,
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
    );
  }

  const mapCenter: [number, number] = [22.5, 72.5];

  return (
    <div>
      {/* Page header */}
      <div style={{ marginBottom: 20 }}>
        <h1
          style={{
            fontSize: '1.25rem',
            fontWeight: 700,
            margin: 0,
            letterSpacing: '-0.02em',
          }}
        >
          Dashboard
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem', margin: '4px 0 0' }}>
          Gujarat Integrated Video Management &amp; Analytics Platform
        </p>
      </div>

      <BentoGrid>
        {/* KPI row */}
        <KpiCard
          label="Total Cameras"
          value={summary!.totalCameras}
          icon={Camera}
          sub={`${summary!.camerasOnline} online · ${summary!.camerasOffline} offline`}
        />
        <KpiCard
          label="Cameras Online"
          value={summary!.camerasOnline}
          icon={Wifi}
          accent="var(--accent-green)"
          sub="Active feeds"
        />
        <KpiCard
          label="Cameras Offline"
          value={summary!.camerasOffline}
          icon={WifiOff}
          accent={summary!.camerasOffline > 0 ? 'var(--accent-amber)' : 'var(--text-muted)'}
          sub="Require attention"
        />
        <KpiCard
          label="Active Alerts"
          value={summary!.activeAlerts}
          icon={AlertTriangle}
          accent={summary!.activeAlerts > 0 ? 'var(--accent-amber)' : 'var(--accent-green)'}
          sub="Unresolved incidents"
        />

        {/* System health */}
        <BentoCard span="1x1">
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 8 }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
              System Health
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
              {summary!.systemHealth === 'healthy' ? (
                <CheckCircle2 size={28} color="var(--accent-green)" />
              ) : (
                <Siren size={28} color="var(--accent-amber)" />
              )}
              <div>
                <div
                  style={{
                    fontSize: '1.1rem',
                    fontWeight: 700,
                    color:
                      summary!.systemHealth === 'healthy'
                        ? 'var(--accent-green)'
                        : 'var(--accent-amber)',
                    textTransform: 'capitalize',
                  }}
                >
                  {summary!.systemHealth}
                </div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                  Grid status
                </div>
              </div>
            </div>
          </div>
        </BentoCard>

        <KpiCard
          label="Vehicles Tracked Today"
          value={summary!.vehiclesTrackedToday}
          icon={Car}
          accent="var(--accent-blue)"
          sub="Unique plates seen"
        />

        <KpiCard
          label="Critical Incidents"
          value={summary!.criticalIncidents}
          icon={Shield}
          accent={summary!.criticalIncidents > 0 ? 'var(--accent-red)' : 'var(--text-muted)'}
          sub="High-priority alerts"
        />

        {/* Spacer to complete the row */}
        <div />

        {/* Recent Alerts — 2x2 */}
        <BentoCard span="2x2">
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 14,
              }}
            >
              <span style={{ fontWeight: 600, fontSize: '0.88rem' }}>Recent Alerts</span>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                Last 5 events
              </span>
            </div>
            <div style={{ flex: 1, overflow: 'auto' }}>
              {alerts.length === 0 && (
                <div
                  style={{
                    color: 'var(--text-muted)',
                    fontSize: '0.8rem',
                    textAlign: 'center',
                    paddingTop: 32,
                  }}
                >
                  No recent alerts
                </div>
              )}
              {alerts.map((alert) => (
                <div key={alert.id} className="feed-row animate-slide-up">
                  <div
                    style={{
                      width: 3,
                      height: 32,
                      borderRadius: 99,
                      background:
                        alert.priority === 'critical'
                          ? 'var(--accent-red)'
                          : alert.priority === 'high'
                          ? 'var(--accent-amber)'
                          : alert.priority === 'medium'
                          ? 'var(--accent-blue)'
                          : 'var(--accent-slate)',
                      flexShrink: 0,
                    }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontWeight: 600,
                        fontSize: '0.82rem',
                        fontFamily: 'JetBrains Mono, monospace',
                        color: 'var(--text-primary)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {alert.plateNumber}
                    </div>
                    <div
                      style={{
                        fontSize: '0.72rem',
                        color: 'var(--text-secondary)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {alert.cameraName}
                    </div>
                  </div>
                  {priorityBadge(alert.priority)}
                  <div
                    style={{
                      fontSize: '0.7rem',
                      color: 'var(--text-muted)',
                      whiteSpace: 'nowrap',
                      flexShrink: 0,
                    }}
                  >
                    {formatDistanceToNow(alert.createdAt)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </BentoCard>

        {/* Mini GIS Map — 2x2 */}
        <BentoCard span="2x2" noPad>
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div
              style={{
                padding: '14px 18px 10px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <span style={{ fontWeight: 600, fontSize: '0.88rem' }}>Camera Overview</span>
              <div style={{ display: 'flex', gap: 12, fontSize: '0.72rem' }}>
                <span style={{ color: 'var(--accent-green)', display: 'flex', gap: 5, alignItems: 'center' }}>
                  <span className="status-dot online" />
                  Online
                </span>
                <span style={{ color: 'var(--accent-red)', display: 'flex', gap: 5, alignItems: 'center' }}>
                  <span className="status-dot offline" />
                  Offline
                </span>
              </div>
            </div>
            <div style={{ flex: 1, minHeight: 0, borderRadius: '0 0 14px 14px', overflow: 'hidden' }}>
              <MapContainer
                center={mapCenter}
                zoom={7}
                style={{ height: '100%', width: '100%' }}
                zoomControl={false}
                attributionControl={false}
              >
                <TileLayer
                  key={tileUrl}
                  url={tileUrl}
                  attribution={TILE_ATTRIBUTION}
                />
                {cameras.map((cam) => (
                  <Marker
                    key={cam.id}
                    position={[cam.lat, cam.lng]}
                    icon={cameraIcon(cam.status === 'online')}
                  >
                    <Popup>
                      <div style={{ fontSize: 12, minWidth: 160 }}>
                        <div style={{ fontWeight: 700, marginBottom: 4 }}>{cam.name}</div>
                        <div style={{ color: 'var(--text-secondary)' }}>{cam.department}</div>
                        <div style={{ marginTop: 6 }}>
                          <span className={`badge badge-${cam.status}`}>{cam.status}</span>
                        </div>
                      </div>
                    </Popup>
                  </Marker>
                ))}
              </MapContainer>
            </div>
          </div>
        </BentoCard>
      </BentoGrid>
    </div>
  );
}
