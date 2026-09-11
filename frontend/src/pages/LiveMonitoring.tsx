import { Activity, Cctv, Wifi, WifiOff } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { getCameras, getRecentDetections } from '../lib/api';
import type { Camera, VehicleSighting } from '../types';
import { formatDateTime, formatDistanceToNow } from '../utils/time';

// Simulated plate pool for live feed injections
const FAKE_PLATES = [
  'GJ02MN2468',
  'GJ03OP1357',
  'GJ04QR9753',
  'GJ09ST2580',
  'GJ11UV3691',
  'GJ14WX4802',
  'GJ17YZ6913',
  'GJ20AB8024',
];

function randomPlate() {
  return FAKE_PLATES[Math.floor(Math.random() * FAKE_PLATES.length)];
}

// Camera tile component
function CameraTile({ camera }: { camera: Camera }) {
  return (
    <div
      className="card"
      style={{ padding: 0, overflow: 'hidden', aspectRatio: '16/9', position: 'relative' }}
    >
      {/* Placeholder frame */}
      <div
        style={{
          width: '100%',
          height: '100%',
          background: 'var(--bg-surface)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {/* Grid lines overlay for visual texture — uses a dark tint so it reads on both light and dark tile backgrounds */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage:
              'linear-gradient(rgba(0,0,0,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.06) 1px, transparent 1px)',
            backgroundSize: '24px 24px',
          }}
        />
        <Cctv
          size={36}
          color={camera.status === 'online' ? 'var(--accent-green)' : 'var(--accent-red)'}
          style={{ opacity: 0.35 }}
          strokeWidth={1.2}
        />
      </div>

      {/* Top-left: camera name */}
      <div
        style={{
          position: 'absolute',
          top: 8,
          left: 10,
          fontSize: '0.68rem',
          fontWeight: 600,
          color: 'var(--text-primary)',
          maxWidth: '65%',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          // subtle shadow for legibility against both light and dark tile backgrounds
          textShadow: '0 1px 3px rgba(0,0,0,0.15)',
        }}
      >
        {camera.name.split(' — ')[1] || camera.name}
      </div>

      {/* Top-right: LIVE / OFFLINE badge */}
      <div style={{ position: 'absolute', top: 8, right: 10 }}>
        {camera.status === 'online' ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              background: 'rgba(240,68,68,0.85)',
              borderRadius: 4,
              padding: '2px 6px',
              fontSize: '0.6rem',
              fontWeight: 700,
              letterSpacing: '0.06em',
              color: 'var(--text-primary)',
            }}
          >
            <span className="live-dot" style={{ width: 5, height: 5 }} />
            LIVE
          </div>
        ) : (
          <div
            style={{
              background: 'rgba(0,0,0,0.6)',
              borderRadius: 4,
              padding: '2px 6px',
              fontSize: '0.6rem',
              fontWeight: 700,
              letterSpacing: '0.06em',
              color: 'var(--accent-red)',
            }}
          >
            OFFLINE
          </div>
        )}
      </div>

      {/* Bottom: camera status */}
      <div
        style={{
          position: 'absolute',
          bottom: 8,
          left: 10,
          display: 'flex',
          alignItems: 'center',
          gap: 5,
        }}
      >
        {camera.status === 'online' ? (
          <Wifi size={11} color="var(--accent-green)" />
        ) : (
          <WifiOff size={11} color="var(--accent-red)" />
        )}
        <span
          style={{
            fontSize: '0.65rem',
            color: camera.status === 'online' ? 'var(--accent-green)' : 'var(--accent-red)',
          }}
        >
          {camera.status === 'online' ? 'Signal OK' : 'No Signal'}
        </span>
      </div>
    </div>
  );
}

interface FeedItem extends VehicleSighting {
  _key: string; // unique per rendered row
  cameraName: string;
}

export function LiveMonitoring() {
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const feedRef = useRef<HTMLDivElement>(null);
  const camsRef = useRef<Camera[]>([]);

  useEffect(() => {
    Promise.all([getCameras(), getRecentDetections(8)])
      .then(([cams, detections]) => {
        camsRef.current = cams;
        setCameras(cams);
        const initial: FeedItem[] = detections.map((d) => ({
          ...d,
          _key: d.id,
          cameraName:
            cams.find((c) => c.id === d.cameraId)?.name ?? d.cameraId,
        }));
        setFeed(initial);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to load cameras:', err);
        setError('Failed to load camera data. Please check your connection and try again.');
        setLoading(false);
      });
  }, []);

  // Ticking detection feed — simulates real-time polling every 2.5s
  useEffect(() => {
    if (loading) return;
    const interval = setInterval(() => {
      const allCams = camsRef.current;
      const onlineCams = allCams.filter((c) => c.status === 'online');
      if (onlineCams.length === 0) return;
      const cam = onlineCams[Math.floor(Math.random() * onlineCams.length)];
      const newItem: FeedItem = {
        id: `live-${Date.now()}`,
        vehicleId: `live-v-${Date.now()}`,
        plateNumber: randomPlate(),
        cameraId: cam.id,
        detectedAt: new Date().toISOString(),
        ocrConfidence: 0.7 + Math.random() * 0.3,
        detectionConfidence: 0.7 + Math.random() * 0.3,
        combinedConfidence: 0.7 + Math.random() * 0.3,
        evidenceFrameUrl: '',
        _key: `live-${Date.now()}`,
        cameraName: cam.name,
      };
      setFeed((prev) => [newItem, ...prev].slice(0, 50));
    }, 2500);
    return () => clearInterval(interval);
  }, [loading]);

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
        Loading cameras…
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
        <Activity size={40} color="var(--accent-red)" strokeWidth={1.2} />
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, letterSpacing: '-0.02em' }}>
            Live Monitoring
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem', margin: '4px 0 0' }}>
            {cameras.filter((c) => c.status === 'online').length} of {cameras.length} cameras online
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--accent-green)', fontSize: '0.78rem', fontWeight: 600 }}>
          <Activity size={14} />
          Auto-refreshing
        </div>
      </div>

      <div className="live-layout" style={{ display: 'flex', gap: 16 }}>
        {/* Camera grid */}
        <div style={{ flex: 1 }}>
          <div className="camera-grid">
            {cameras.map((cam) => (
              <CameraTile key={cam.id} camera={cam} />
            ))}
          </div>
        </div>

        {/* Detection feed sidebar */}
        <div
          className="card live-feed-panel"
          style={{ width: 320, flexShrink: 0, padding: 0, display: 'flex', flexDirection: 'column', maxHeight: 'calc(100vh - 160px)', overflow: 'hidden' }}
        >
          <div
            style={{
              padding: '14px 16px',
              borderBottom: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexShrink: 0,
            }}
          >
            <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>Detection Feed</span>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                fontSize: '0.7rem',
                color: 'var(--accent-red)',
              }}
            >
              <span className="live-dot" />
              Live
            </div>
          </div>
          <div ref={feedRef} style={{ flex: 1, overflowY: 'auto' }}>
            {feed.map((item, i) => (
              <div
                key={item._key}
                className="feed-row"
                style={{
                  opacity: i === 0 ? 1 : Math.max(0.4, 1 - i * 0.04),
                  animation: i === 0 ? 'slideInUp 0.3s ease both' : undefined,
                }}
              >
                <div
                  style={{
                    fontFamily: 'JetBrains Mono, monospace',
                    fontWeight: 600,
                    fontSize: '0.78rem',
                    color: 'var(--text-primary)',
                    minWidth: 96,
                  }}
                >
                  {item.plateNumber}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: '0.68rem',
                      color: 'var(--text-secondary)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {item.cameraName.split(' — ')[1] || item.cameraName}
                  </div>
                  <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                    {i === 0 ? 'Just now' : formatDistanceToNow(item.detectedAt)}
                  </div>
                </div>
                <div style={{ fontSize: '0.68rem', color: 'var(--accent-green)', fontWeight: 600 }}>
                  {Math.round(item.combinedConfidence * 100)}%
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
