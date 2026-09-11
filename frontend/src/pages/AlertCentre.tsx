import { AlertTriangle, Camera, Check, ChevronRight, Clock, Filter, Shield, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import {
  getAlerts,
  getCameraById,
  getSightingById,
  getWatchlistEntity,
  updateAlertStatus,
} from '../lib/api';
import type { Alert, Camera as CameraType, VehicleSighting, WatchlistEntity } from '../types';
import { formatDateTime, formatDistanceToNow } from '../utils/time';

// ─── Drawer ───────────────────────────────────────────────────────────────────

interface DrawerData {
  alert: Alert;
  watchlist: WatchlistEntity | null;
  sighting: VehicleSighting | null;
  camera: CameraType | null;
}

function AlertDrawer({
  data,
  onClose,
  onAcknowledge,
  onResolve,
}: {
  data: DrawerData;
  onClose: () => void;
  onAcknowledge: (id: string) => void;
  onResolve: (id: string) => void;
}) {
  const { alert, watchlist, sighting, camera } = data;

  return (
    <>
      <div className="drawer-overlay" onClick={onClose} />
      <div className="drawer glass" style={{ padding: 0 }}>
        {/* Header */}
        <div
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <div style={{ fontWeight: 700, fontSize: '1rem' }}>Alert Detail</div>
            <div
              style={{
                fontSize: '0.72rem',
                color: 'var(--text-muted)',
                fontFamily: 'JetBrains Mono, monospace',
                marginTop: 2,
              }}
            >
              {alert.id}
            </div>
          </div>
          <button
            className="btn btn-ghost"
            onClick={onClose}
            style={{ padding: '5px 8px' }}
            aria-label="Close drawer"
          >
            <X size={16} />
          </button>
        </div>

        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 20, overflowY: 'auto' }}>
          {/* Priority + Status */}
          <div style={{ display: 'flex', gap: 8 }}>
            <span className={`badge badge-${alert.priority}`}>{alert.priority}</span>
            <span className={`badge badge-${alert.status}`}>{alert.status}</span>
            <span className="badge" style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--text-secondary)' }}>
              {alert.category}
            </span>
          </div>

          {/* Plate */}
          <div
            style={{
              padding: '14px 18px',
              borderRadius: 10,
              background:
                alert.priority === 'critical'
                  ? 'var(--accent-red-dim)'
                  : alert.priority === 'high'
                  ? 'var(--accent-amber-dim)'
                  : 'var(--bg-surface)',
              border: `1px solid ${
                alert.priority === 'critical'
                  ? 'rgba(240,68,68,0.2)'
                  : alert.priority === 'high'
                  ? 'rgba(245,158,11,0.2)'
                  : 'var(--border)'
              }`,
            }}
          >
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: 4 }}>
              Registration Number
            </div>
            <div
              style={{
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: '1.5rem',
                fontWeight: 700,
                letterSpacing: '0.06em',
              }}
            >
              {alert.plateNumber}
            </div>
          </div>

          {/* Triggering details */}
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontWeight: 600, fontSize: '0.82rem', marginBottom: 2 }}>
              Triggering Event
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Camera size={13} color="var(--text-muted)" />
              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                {alert.cameraName}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Clock size={13} color="var(--text-muted)" />
              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                {formatDateTime(alert.createdAt)}
              </span>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                ({formatDistanceToNow(alert.createdAt)})
              </span>
            </div>
            {sighting && (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                  paddingTop: 6,
                  borderTop: '1px solid var(--border)',
                }}
              >
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                  Confidence scores
                </div>
                {[
                  { label: 'OCR', val: sighting.ocrConfidence },
                  { label: 'Detection', val: sighting.detectionConfidence },
                  { label: 'Combined', val: sighting.combinedConfidence },
                ].map(({ label, val }) => (
                  <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', width: 64 }}>
                      {label}
                    </span>
                    <div className="conf-bar-bg" style={{ flex: 1 }}>
                      <div
                        className="conf-bar-fill"
                        style={{
                          width: `${val * 100}%`,
                          background:
                            val >= 0.9
                              ? 'var(--accent-green)'
                              : val >= 0.75
                              ? 'var(--accent-blue)'
                              : 'var(--accent-amber)',
                        }}
                      />
                    </div>
                    <span style={{ fontSize: '0.7rem', fontWeight: 600, width: 30, textAlign: 'right', color: 'var(--text-secondary)' }}>
                      {Math.round(val * 100)}%
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Evidence frame placeholder */}
          <div
            style={{
              borderRadius: 10,
              background: 'var(--bg-surface)',
              border: '1px solid var(--border)',
              aspectRatio: '16/9',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}
          >
            <Camera size={28} color="var(--text-muted)" strokeWidth={1.2} />
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              Evidence frame — pending storage integration
            </span>
          </div>

          {/* Watchlist entity */}
          {watchlist && (
            <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  fontWeight: 600,
                  fontSize: '0.82rem',
                }}
              >
                <Shield size={13} color="var(--accent-red)" />
                Watchlist Match
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                {watchlist.description}
              </div>
              <div
                style={{
                  fontSize: '0.7rem',
                  color: 'var(--text-muted)',
                  fontFamily: 'JetBrains Mono, monospace',
                }}
              >
                Ref: {watchlist.referenceNo}
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <span className={`badge badge-${watchlist.priority}`}>{watchlist.priority}</span>
                <span className="badge" style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--text-secondary)' }}>
                  {watchlist.category}
                </span>
                <span className="badge" style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--text-secondary)' }}>
                  {watchlist.entityType}
                </span>
              </div>
            </div>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', gap: 10, paddingTop: 4 }}>
            {alert.status === 'new' && (
              <button
                className="btn btn-amber"
                style={{ flex: 1 }}
                onClick={() => onAcknowledge(alert.id)}
              >
                <Check size={14} />
                Acknowledge
              </button>
            )}
            {alert.status !== 'resolved' && (
              <button
                className="btn btn-primary"
                style={{ flex: 1, background: 'var(--accent-green)', color: '#080b0f' }}
                onClick={() => onResolve(alert.id)}
              >
                <Check size={14} />
                Resolve
              </button>
            )}
            {alert.status === 'resolved' && (
              <div
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  fontSize: '0.8rem',
                  color: 'var(--accent-green)',
                  fontWeight: 600,
                }}
              >
                <Check size={14} />
                Resolved
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Alert Centre ─────────────────────────────────────────────────────────────

export function AlertCentre() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterPriority, setFilterPriority] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [drawerData, setDrawerData] = useState<DrawerData | null>(null);
  const [drawerLoading, setDrawerLoading] = useState(false);

  const loadAlerts = useCallback(async () => {
    try {
      const data = await getAlerts({ priority: filterPriority, status: filterStatus });
      setAlerts(data);
      setError(null);
    } catch (err) {
      console.error('Failed to load alerts:', err);
      setError('Failed to load alerts. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }, [filterPriority, filterStatus]);

  useEffect(() => {
    setLoading(true);
    loadAlerts();
  }, [loadAlerts]);

  const openDrawer = async (alert: Alert) => {
    setDrawerLoading(true);
    const [watchlist, sighting] = await Promise.all([
      getWatchlistEntity(alert.watchlistId),
      getSightingById(alert.vehicleSightingId),
    ]);
    const camera = sighting ? await getCameraById(sighting.cameraId) : null;
    setDrawerData({ alert, watchlist, sighting, camera });
    setDrawerLoading(false);
  };

  const handleAcknowledge = async (id: string) => {
    // Optimistic update
    setAlerts((prev) =>
      prev.map((a) => (a.id === id ? { ...a, status: 'acknowledged' } : a)),
    );
    if (drawerData?.alert.id === id) {
      setDrawerData((d) => d && { ...d, alert: { ...d.alert, status: 'acknowledged' } });
    }
    await updateAlertStatus(id, 'acknowledged');
  };

  const handleResolve = async (id: string) => {
    // Optimistic update
    setAlerts((prev) =>
      prev.map((a) => (a.id === id ? { ...a, status: 'resolved' } : a)),
    );
    if (drawerData?.alert.id === id) {
      setDrawerData((d) => d && { ...d, alert: { ...d.alert, status: 'resolved' } });
    }
    await updateAlertStatus(id, 'resolved');
  };

  const priorityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

  const sorted = [...alerts].sort(
    (a, b) =>
      (priorityOrder[a.priority] ?? 4) - (priorityOrder[b.priority] ?? 4) ||
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h1 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, letterSpacing: '-0.02em' }}>
              Alert Centre
            </h1>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem', margin: '4px 0 0' }}>
              {alerts.filter((a) => a.status !== 'resolved').length} active alerts
            </p>
          </div>

          {/* Filters */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Filter size={14} color="var(--text-muted)" />
            <select
              id="filter-priority"
              className="select"
              value={filterPriority}
              onChange={(e) => setFilterPriority(e.target.value)}
            >
              <option value="all">All Priorities</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
            <select
              id="filter-status"
              className="select"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
            >
              <option value="all">All Statuses</option>
              <option value="new">New</option>
              <option value="acknowledged">Acknowledged</option>
              <option value="resolved">Resolved</option>
            </select>
          </div>
        </div>

        {/* Alert list */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {/* Table wrapper — horizontally scrollable on narrow viewports */}
        <div className="alert-table-scroll">
          {/* Table header */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '3fr 2fr 2fr 1fr 1fr 1fr auto',
              padding: '10px 20px',
              borderBottom: '1px solid var(--border)',
              fontSize: '0.7rem',
              color: 'var(--text-muted)',
              fontWeight: 600,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              gap: 12,
              minWidth: 640,
            }}
          >
            <span>Camera / Plate</span>
            <span>Category</span>
            <span>Time</span>
            <span>Priority</span>
            <span>Status</span>
            <span>Actions</span>
            <span />
          </div>

          {loading && (
            <div
              style={{
                padding: '32px',
                textAlign: 'center',
                color: 'var(--text-muted)',
                fontSize: '0.82rem',
              }}
            >
              Loading alerts…
            </div>
          )}

          {!loading && error && (
            <div
              style={{
                padding: '48px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 10,
                color: 'var(--text-muted)',
              }}
            >
              <AlertTriangle size={32} strokeWidth={1.2} color="var(--accent-red)" />
              <span style={{ fontSize: '0.85rem', color: 'var(--text-primary)' }}>{error}</span>
              <button
                className="btn btn-primary"
                onClick={() => loadAlerts()}
                style={{ marginTop: 8 }}
              >
                Retry
              </button>
            </div>
          )}

          {!loading && !error && sorted.length === 0 && (
            <div
              style={{
                padding: '48px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 10,
                color: 'var(--text-muted)',
              }}
            >
              <AlertTriangle size={32} strokeWidth={1.2} />
              <span style={{ fontSize: '0.85rem' }}>No alerts match the current filters</span>
            </div>
          )}

          {!error && sorted.map((alert) => (
            <div
              key={alert.id}
              style={{
                display: 'grid',
                gridTemplateColumns: '3fr 2fr 2fr 1fr 1fr 1fr auto',
                padding: '13px 20px',
                borderBottom: '1px solid var(--border)',
                alignItems: 'center',
                gap: 12,
                cursor: 'pointer',
                transition: 'background 0.15s',
                opacity: alert.status === 'resolved' ? 0.55 : 1,
                minWidth: 640,
              }}
              onMouseEnter={(e) =>
                ((e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.03)')
              }
              onMouseLeave={(e) =>
                ((e.currentTarget as HTMLDivElement).style.background = '')
              }
              onClick={() => openDrawer(alert)}
            >
              <div>
                <div
                  style={{
                    fontFamily: 'JetBrains Mono, monospace',
                    fontWeight: 600,
                    fontSize: '0.85rem',
                  }}
                >
                  {alert.plateNumber}
                </div>
                <div
                  style={{
                    fontSize: '0.72rem',
                    color: 'var(--text-muted)',
                    marginTop: 2,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {alert.cameraName}
                </div>
              </div>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', textTransform: 'capitalize' }}>
                {alert.category}
              </span>
              <div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                  {formatDateTime(alert.createdAt)}
                </div>
                <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                  {formatDistanceToNow(alert.createdAt)}
                </div>
              </div>
              <span className={`badge badge-${alert.priority}`}>{alert.priority}</span>
              <span className={`badge badge-${alert.status}`}>{alert.status}</span>
              <div
                style={{ display: 'flex', gap: 5 }}
                onClick={(e) => e.stopPropagation()}
              >
                {alert.status === 'new' && (
                  <button
                    className="btn btn-amber"
                    style={{ padding: '4px 8px', fontSize: '0.7rem' }}
                    title="Acknowledge"
                    onClick={() => handleAcknowledge(alert.id)}
                  >
                    <Check size={11} />
                  </button>
                )}
                {alert.status !== 'resolved' && (
                  <button
                    className="btn"
                    style={{
                      padding: '4px 8px',
                      fontSize: '0.7rem',
                      background: 'var(--accent-green-dim)',
                      color: 'var(--accent-green)',
                    }}
                    title="Resolve"
                    onClick={() => handleResolve(alert.id)}
                  >
                    <Check size={11} />
                  </button>
                )}
              </div>
              <ChevronRight size={14} color="var(--text-muted)" />
            </div>
          ))}
        </div>
        </div>
      </div>

      {/* Detail drawer */}
      {drawerLoading && (
        <div className="drawer-overlay">
          <div
            style={{
              position: 'fixed',
              top: '50%',
              right: 220,
              transform: 'translateY(-50%)',
              color: 'var(--text-muted)',
              fontSize: '0.82rem',
            }}
          >
            Loading…
          </div>
        </div>
      )}
      {drawerData && !drawerLoading && (
        <AlertDrawer
          data={drawerData}
          onClose={() => setDrawerData(null)}
          onAcknowledge={handleAcknowledge}
          onResolve={handleResolve}
        />
      )}
    </>
  );
}
