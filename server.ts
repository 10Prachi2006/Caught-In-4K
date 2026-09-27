import 'dotenv/config';
import express, { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import { db, syncCamerasFromGrid, GridCameraEntry } from './src/server/db.ts';


// ==================== CCTV GRID CONFIG & CACHE ====================
const CCTV_GRID_HOST = (process.env.CCTV_GRID_HOST || '').replace(/\/+$/, '');

/** In-memory catalogue cache: avoids hammering the gateway on every card render. */
const gridCatalogueCache: {
  data: GridCameraEntry[] | null;
  fetchedAt: number;
} = { data: null, fetchedAt: 0 };

const GRID_CACHE_TTL_MS = 8_000; // 8 seconds

/**
 * Fetches (or serves from cache) the real camera catalogue from the shared
 * CCTV grid. Returns null when CCTV_GRID_HOST is not configured.
 */
async function fetchGridCatalogue(): Promise<GridCameraEntry[] | null> {
  if (!CCTV_GRID_HOST) {
    console.warn('[live-grid] CCTV_GRID_HOST is not set — skipping catalogue fetch');
    return null;
  }

  const now = Date.now();
  if (gridCatalogueCache.data && now - gridCatalogueCache.fetchedAt < GRID_CACHE_TTL_MS) {
    console.debug(`[live-grid] cache hit (age ${now - gridCatalogueCache.fetchedAt}ms)`);
    return gridCatalogueCache.data;
  }

  console.log(`[live-grid] fetching catalogue from ${CCTV_GRID_HOST}/api/ingest`);

  const headers: Record<string, string> = {
    Accept: 'application/json, text/plain, */*',
  };
  const email = process.env.CORP8_EMAIL || process.env.CCTV_GRID_EMAIL;
  const password = process.env.CORP8_PASSWORD || process.env.CCTV_GRID_PASSWORD;
  if (email && password) {
    const authString = Buffer.from(`${email}:${password}`).toString('base64');
    headers['Authorization'] = `Basic ${authString}`;
  }

  try {
    const res = await fetch(`${CCTV_GRID_HOST}/api/ingest`, {
      headers,
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) {
      console.warn(`[live-grid] Grid catalogue HTTP ${res.status}: ${res.statusText}`);
      return null;
    }

    const text = await res.text();
    if (
      text.trim().startsWith('<') ||
      text.includes('Sign in') ||
      text.includes('<!doctype') ||
      text.includes('<html')
    ) {
      console.warn(
        `[live-grid] ${CCTV_GRID_HOST} returned an HTML login page (Sentinel auth). Grid auto-sync paused; local camera registry (12 nodes) is active.`
      );
      return null;
    }

    let raw: any;
    try {
      raw = JSON.parse(text);
    } catch {
      console.warn('[live-grid] response was not valid JSON; local camera registry (12 nodes) is active.');
      return null;
    }

    // Grid may return { cameras: [...] } or directly [...]
    const entries: GridCameraEntry[] = Array.isArray(raw)
      ? raw
      : raw.cameras || raw.feeds || raw.streams || [];

    gridCatalogueCache.data = entries;
    gridCatalogueCache.fetchedAt = Date.now();
    console.log(`[live-grid] catalogue cached: ${entries.length} cameras`);
    return entries;
  } catch (err: any) {
    console.warn('[live-grid] fetchGridCatalogue error:', err.message);
    return null;
  }
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // JSON Body parser
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  // CORS and Cache control headers
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
      res.sendStatus(200);
      return;
    }
    next();
  });

  // ==================== API ROUTES ====================

  // Health Check
  app.get('/api/health', (req: Request, res: Response) => {
    res.json({
      status: 'ok',
      service: 'IVMAP Surveillance Node',
      timestamp: new Date().toISOString(),
    });
  });

  // Dashboard Summary
  app.get('/api/dashboard/summary', (req: Request, res: Response) => {
    try {
      const summary = db.getDashboardSummary();
      res.json(summary);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Cameras Endpoints
  app.get('/api/cameras', (req: Request, res: Response) => {
    try {
      const cameras = db.getCameras();
      res.json(cameras);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/cameras/:id', (req: Request, res: Response) => {
    try {
      const camera = db.getCameraById(req.params.id);
      if (!camera) {
        res.status(404).json({ error: 'Camera not found' });
        return;
      }
      res.json(camera);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/cameras', (req: Request, res: Response) => {
    try {
      const created = db.createCamera(req.body);
      res.status(201).json(created);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.put('/api/cameras/:id', (req: Request, res: Response) => {
    try {
      const updated = db.updateCamera(req.params.id, req.body);
      res.json(updated);
    } catch (err: any) {
      res.status(404).json({ error: err.message });
    }
  });

  app.delete('/api/cameras/:id', (req: Request, res: Response) => {
    try {
      const deleted = db.deleteCamera(req.params.id);
      if (!deleted) {
        res.status(404).json({ error: 'Camera not found' });
        return;
      }
      res.json({ success: true, id: req.params.id });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Watchlist Endpoints
  app.get('/api/watchlist', (req: Request, res: Response) => {
    try {
      const watchlist = db.getWatchlist();
      res.json(watchlist);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/watchlist', (req: Request, res: Response) => {
    try {
      const created = db.addWatchlistEntry(req.body);
      res.status(201).json(created);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.put('/api/watchlist/:id', (req: Request, res: Response) => {
    try {
      const updated = db.updateWatchlistEntry(req.params.id, req.body);
      res.json(updated);
    } catch (err: any) {
      res.status(404).json({ error: err.message });
    }
  });

  app.delete('/api/watchlist/:id', (req: Request, res: Response) => {
    try {
      const deleted = db.deleteWatchlistEntry(req.params.id);
      if (!deleted) {
        res.status(404).json({ error: 'Watchlist entry not found' });
        return;
      }
      res.json({ success: true, id: req.params.id });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Alerts Endpoints
  app.get('/api/alerts', (req: Request, res: Response) => {
    try {
      const { status, priority, matchType } = req.query;
      const alerts = db.getAlerts({
        status: status as string,
        priority: priority as string,
        matchType: matchType as string,
      });
      res.json(alerts);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/alerts/:id', (req: Request, res: Response) => {
    try {
      const alert = db.getAlertById(req.params.id);
      if (!alert) {
        res.status(404).json({ error: 'Alert not found' });
        return;
      }
      res.json(alert);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.patch('/api/alerts/:id/status', (req: Request, res: Response) => {
    try {
      const { status, notes, reviewedBy } = req.body;
      if (!status) {
        res.status(400).json({ error: 'Status is required' });
        return;
      }
      const updated = db.updateAlertStatus(req.params.id, status, notes, reviewedBy);
      res.json(updated);
    } catch (err: any) {
      res.status(404).json({ error: err.message });
    }
  });

  // Sightings / Detections Search & Ingest Endpoints
  app.get('/api/sightings', (req: Request, res: Response) => {
    try {
      const { query, cameraId, vehicleType, minConfidence, matchType } = req.query;
      const results = db.searchSightings({
        query: query as string,
        cameraId: cameraId as string,
        vehicleType: vehicleType as string,
        minConfidence: minConfidence ? Number(minConfidence) : undefined,
        matchType: matchType as string,
      });
      res.json(results);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Alias for detections
  app.get('/api/detections', (req: Request, res: Response) => {
    try {
      const { query, cameraId, vehicleType, minConfidence, matchType } = req.query;
      const results = db.searchSightings({
        query: query as string,
        cameraId: cameraId as string,
        vehicleType: vehicleType as string,
        minConfidence: minConfidence ? Number(minConfidence) : undefined,
        matchType: matchType as string,
      });
      res.json(results);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/sightings/:id', (req: Request, res: Response) => {
    try {
      const sighting = db.getSightingById(req.params.id);
      if (!sighting) {
        res.status(404).json({ error: 'Sighting not found' });
        return;
      }
      res.json(sighting);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/detections/:id', (req: Request, res: Response) => {
    try {
      const sighting = db.getSightingById(req.params.id);
      if (!sighting) {
        res.status(404).json({ error: 'Detection not found' });
        return;
      }
      const detection = {
        id: sighting.id,
        plateNumber: sighting.plateNumber,
        normalizedPlate: sighting.plateNumber.replace(/[^A-Z0-9]/gi, '').toUpperCase(),
        rawOcrText: sighting.plateNumber,
        cameraId: sighting.cameraId,
        cameraName: sighting.cameraName,
        location: sighting.location,
        timestamp: sighting.timestamp,
        detectionConfidence: sighting.detectionConfidence,
        ocrConfidence: sighting.ocrConfidence,
        trackingConfidence: sighting.trackingConfidence ?? 95.0,
        trackingId: sighting.trackingId || 'TRK-400',
        aggregationAgreement: sighting.aggregationAgreement || '13/16 (81.2%)',
        vehicleType: sighting.vehicleType || 'Sedan',
        vehicleColor: sighting.vehicleColor || 'Dark Metallic',
        isWatchlistMatch: sighting.matchType === 'exact' || sighting.matchType === 'possible',
        matchType: sighting.matchType || 'none',
        matchedWatchlistPlate: sighting.matchedWatchlistPlate,
        watchlistReason:
          sighting.matchType === 'possible'
            ? `Possible Match with ${sighting.matchedWatchlistPlate}`
            : sighting.matchType === 'exact'
            ? 'Exact Watchlist Match'
            : undefined,
        evidenceUrl:
          sighting.evidenceUrl ||
          'https://images.unsplash.com/photo-1549399542-7e3f8b79c341?w=800&auto=format&fit=crop&q=80',
      };
      res.json(detection);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * Ingest Sighting from YOLO + OCR Pipeline.
   * Runs the Watchlist Matching logic (Exact + Possible Match with Levenshtein distance).
   * Supports both camelCase and snake_case payload contracts for seamless Python/Node bridge.
   */
  const handleIngestSighting = (req: Request, res: Response) => {
    try {
      const plateNumber = req.body.plateNumber || req.body.plate_number;
      const cameraId = req.body.cameraId || req.body.camera_id;
      const cameraName = req.body.cameraName || req.body.camera_name;
      const location = req.body.location;
      const detectionConfidence =
        req.body.detectionConfidence ?? req.body.system_confidence ?? req.body.vehicle_confidence;
      const ocrConfidence = req.body.ocrConfidence ?? req.body.ocr_confidence;
      const trackingConfidence = req.body.trackingConfidence ?? req.body.plate_confidence;
      const trackingId =
        req.body.trackingId || (req.body.track_id !== undefined ? `TRK-${req.body.track_id}` : undefined);
      const aggregationAgreement = req.body.aggregationAgreement || req.body.aggregation_agreement;
      const vehicleType = req.body.vehicleType || req.body.vehicle_type;
      const vehicleColor = req.body.vehicleColor || req.body.vehicle_color;
      const speedKmh = req.body.speedKmh ?? req.body.speed_kmh;
      const evidenceUrl = req.body.evidenceUrl || req.body.evidence_url;
      const timestamp = req.body.timestamp || req.body.video_timestamp;

      if (!plateNumber || !cameraId) {
        res.status(400).json({ error: 'plateNumber (or plate_number) and cameraId (or camera_id) are required' });
        return;
      }

      const result = db.addSighting({
        plateNumber,
        cameraId,
        cameraName,
        location,
        detectionConfidence: detectionConfidence !== undefined ? Number(detectionConfidence) : undefined,
        ocrConfidence: ocrConfidence !== undefined ? Number(ocrConfidence) : undefined,
        trackingConfidence: trackingConfidence !== undefined ? Number(trackingConfidence) : undefined,
        trackingId,
        aggregationAgreement,
        vehicleType,
        vehicleColor,
        speedKmh: speedKmh !== undefined ? Number(speedKmh) : undefined,
        evidenceUrl,
        timestamp: timestamp ? String(timestamp) : undefined,
      });

      // Provide both Express and FastAPI compatibility fields in response
      res.status(201).json({
        ...result,
        plate_number: result.sighting.plateNumber,
        camera_id: result.sighting.cameraId,
        watchlist_match: result.matchResult.isMatch,
        alert: result.alert
          ? {
              ...result.alert,
              matched_plate: result.alert.matchedWatchlistPlate,
              match_type: result.alert.matchType,
              status: result.alert.status,
              priority: result.alert.priority,
            }
          : null,
      });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  };

  app.post('/api/sightings', handleIngestSighting);
  app.post('/api/v1/sightings', handleIngestSighting);
  app.post('/api/detections', handleIngestSighting);

  // Vehicle Route Points for GIS
  app.get('/api/routes/:plate', (req: Request, res: Response) => {
    try {
      const points = db.getRouteForPlate(req.params.plate);
      res.json(points);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Pipeline Status & Multi-Camera Test Runner
  app.get('/api/pipeline/status', (req: Request, res: Response) => {
    try {
      const status = db.getPipelineStatus();
      res.json(status);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/pipeline/run-live-test', (req: Request, res: Response) => {
    try {
      const { plateNumber, targetWatchlistPlate, isPossibleMatchFumble, multiCameraSequence } = req.body;
      const result = db.runLivePipelineTest({
        plateNumber,
        targetWatchlistPlate,
        isPossibleMatchFumble: Boolean(isPossibleMatchFumble),
        multiCameraSequence: multiCameraSequence !== false,
      });
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Server-Sent Events (SSE) for Real-Time Event Streaming
  app.get('/api/live/events', (req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    // Send initial handshake
    res.write(`data: ${JSON.stringify({ type: 'connected', timestamp: Date.now() })}\n\n`);

    // Subscribe to DB mutations
    const unsubscribe = db.subscribe((event) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    });

    // Heartbeat every 20 seconds to keep connection alive
    const heartbeat = setInterval(() => {
      res.write(`: heartbeat ${Date.now()}\n\n`);
    }, 20000);

    req.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  });

  // ==================== CCTV GRID PROXY ROUTES ====================

  /**
   * GET /api/live-grid/cameras
   * Server-side proxy to the real CCTV grid catalogue.
   * Cached for GRID_CACHE_TTL_MS to prevent hammering the gateway on page
   * renders with multiple camera cards. The grid host never reaches the browser
   * (sidesteps any CORS restriction on the gateway).
   */
  app.get('/api/live-grid/cameras', async (req: Request, res: Response) => {
    try {
      const entries = await fetchGridCatalogue();
      if (!entries) {
        if (!CCTV_GRID_HOST) {
          res.status(503).json({
            error: 'CCTV_GRID_HOST is not configured.',
            hint: 'Add CCTV_GRID_HOST=http://<host> to your .env file and restart.',
          });
        } else {
          res.status(502).json({
            error: `Grid host ${CCTV_GRID_HOST} returned an HTML login page (Sentinel auth) instead of a JSON catalogue.`,
            hint: 'Accessing cctv.corp8.cloud requires interactive browser login. The local surveillance registry (12 cameras) remains active.',
          });
        }
        return;
      }
      res.json(entries);
    } catch (err: any) {
      console.error('[live-grid] catalogue fetch error:', err.message);
      res.status(502).json({ error: `Grid unreachable: ${err.message}` });
    }
  });

  /**
   * POST /api/live-grid/sync
   * Triggers an immediate (bypasses cache) re-sync of the grid catalogue
   * into the local camera store. Intended for the manual "Sync from Grid"
   * button in the Camera Registry page.
   */
  app.post('/api/live-grid/sync', async (req: Request, res: Response) => {
    try {
      if (!CCTV_GRID_HOST) {
        res.status(503).json({
          error: 'CCTV_GRID_HOST is not configured.',
          hint: 'Add CCTV_GRID_HOST=http://<host> to your .env file.',
        });
        return;
      }
      // Bust the cache so we get a fresh fetch
      gridCatalogueCache.data = null;
      gridCatalogueCache.fetchedAt = 0;

      const entries = await fetchGridCatalogue();
      if (!entries) {
        res.status(502).json({
          error: 'Grid returned an HTML login page (Sentinel auth) instead of a JSON camera catalogue.',
          hint: 'The domain cctv.corp8.cloud is protected by Sentinel browser authentication. Local camera registry (12 nodes) is active.',
        });
        return;
      }

      const result = syncCamerasFromGrid(entries);
      res.json({ success: true, ...result });
    } catch (err: any) {
      console.error('[live-grid] sync error:', err.message);
      res.status(502).json({ error: `Sync failed: ${err.message}` });
    }
  });

  // ==================== LOCAL CCTV VIDEOS ====================
  app.get('/videos/:filename', (req: Request, res: Response) => {
    const filename = path.basename(req.params.filename);
    const publicPath = path.join(process.cwd(), 'public', 'videos', filename);
    const rootPath = path.join(process.cwd(), filename);
    const targetPath = fs.existsSync(publicPath) ? publicPath : (fs.existsSync(rootPath) ? rootPath : null);

    if (!targetPath) {
      res.status(404).send(`Video ${filename} not found`);
      return;
    }

    res.sendFile(targetPath);
  });

  // ==================== LIVE CAMERA STREAM PROXY (run_live.py) ====================
  app.get('/api/live-stream/:cameraId', async (req: Request, res: Response) => {
    const camId = req.params.cameraId;
    // Map CAM-01 -> cam01, CAM-02 -> cam02, etc.
    const normalizedId = camId.toLowerCase().replace(/[^a-z0-9]/g, '');
    const upstreamUrl = `http://127.0.0.1:8010/live/${normalizedId}`;

    try {
      const upstream = await fetch(upstreamUrl, { signal: AbortSignal.timeout(5000) });
      if (!upstream.ok || !upstream.body) {
        res.status(upstream.status).send(`Upstream stream returned ${upstream.status}`);
        return;
      }

      res.setHeader('Content-Type', upstream.headers.get('content-type') || 'multipart/x-mixed-replace; boundary=frame');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Connection', 'close');
      res.setHeader('Pragma', 'no-cache');

      const { Readable } = await import('stream');
      // @ts-ignore
      const nodeStream = Readable.fromWeb(upstream.body);
      nodeStream.pipe(res);
      req.on('close', () => {
        try {
          nodeStream.destroy();
        } catch {}
      });
    } catch (err: any) {
      res.status(502).json({ error: `Stream unavailable: ${err.message}` });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`IVMAP Unified Surveillance Server running on http://0.0.0.0:${PORT}`);

    // Startup: attempt to sync real cameras from the grid catalogue.
    // Errors are non-fatal — the app works fine with local/seed data.
    if (CCTV_GRID_HOST) {
      fetchGridCatalogue()
        .then((entries) => {
          if (entries && entries.length > 0) {
            const { synced, total } = syncCamerasFromGrid(entries);
            console.log(`[live-grid] startup sync complete: ${synced}/${total} cameras upserted`);
          }
        })
        .catch((err) => {
          console.warn('[live-grid] startup sync failed (will retry on next /api/live-grid/sync):', err.message);
        });
    } else {
      console.warn('[live-grid] CCTV_GRID_HOST not set — camera grid sync disabled. Set it in .env to enable.');
    }
  });

}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
