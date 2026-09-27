# IVMAP → Real CCTV Grid Integration

Wire the existing IVMAP Express+React app to the real camera grid via its `/api/ingest` catalogue. No new scaffolding — every change is surgical on existing files.

---

## Key Findings from Code Review

| Problem (from prompt) | Confirmed in code | Fix |
|---|---|---|
| Fake `rtsp://cam0N.internal.ivmap/…` URLs | `db.ts` L37, 52, 67, 82, 97, 112 and `createCamera()` default L608 | Replace with HLS URLs from catalogue |
| `GET /api/ingest` never called | Searched entire codebase — no call exists | Add proxy + sync |
| `Hls.Events.ERROR` handler ignores `data.fatal`, no backoff | `LiveVideoPlayer.tsx` L103–106 | Full replacement with exponential backoff |
| `<video loop>` on live source | `LiveVideoPlayer.tsx` L151 | Remove `loop` attr |
| RTSP banner as primary live path | L304–324 | Keep only as last-resort fallback note |
| `LiveStreamGuideModal` uses `/api/pipeline/ingest` | L279 (doesn't exist in server.ts) | Fix endpoint reference to `/api/sightings` |
| Camera fps/res/status static | Never re-polled | Add 15 s polling interval |

---

## Proposed Changes

### Task 1 — Grid Catalogue Proxy

#### [MODIFY] [server.ts](file:///c:/Users/Admin/Downloads/ivmap_-intelligent-video-management-and-analytics-platform-for-unified-cctv-intelligence/server.ts)

Add:
- `CCTV_GRID_HOST` read from `process.env`
- In-memory cache: `{ data, fetchedAt }` with 8-second TTL
- `GET /api/live-grid/cameras` — fetches `${CCTV_GRID_HOST}/api/ingest`, caches, returns
- Startup call to `db.syncCamerasFromGrid()` (Task 2)
- Log line distinguishing cache-hit vs. live-fetch for verification

#### [MODIFY] [.env.example](file:///c:/Users/Admin/Downloads/ivmap_-intelligent-video-management-and-analytics-platform-for-unified-cctv-intelligence/.env.example)

Add:
```
# Real CCTV Grid host (no trailing slash). Omit port for default 80.
CCTV_GRID_HOST=http://<host>
```

#### [MODIFY] [.env](file:///c:/Users/Admin/Downloads/ivmap_-intelligent-video-management-and-analytics-platform-for-unified-cctv-intelligence/.env)

Add `CCTV_GRID_HOST=` placeholder (user fills in real host).

---

### Task 2 — Camera Store Sync

#### [MODIFY] [src/server/db.ts](file:///c:/Users/Admin/Downloads/ivmap_-intelligent-video-management-and-analytics-platform-for-unified-cctv-intelligence/src/server/db.ts)

Add `syncCamerasFromGrid(catalogueEntries: GridCamera[])` public method that:
- Accepts the catalogue array (already fetched by the proxy route)
- Derives HLS URL: `${CCTV_GRID_HOST}/live/stream/<id>/index.m3u8` (or uses the `hls` field from catalogue if present)
- **Upserts** each entry into `this.data.cameras` — updates if ID exists, pushes if new
- **Never deletes** cameras already in the store that aren't in the catalogue
- Calls `saveData()` and emits `camera:synced` event

Also:
- Change the default `streamUrl` in `createCamera()` from `rtsp://…` to an empty string (so manually-added cameras without a URL get a clear empty slot rather than a fake URL)
- Fix the `DEFAULT_CAMERAS` seed entries: change their `streamUrl` to `''` so they don't pollute the store with fake RTSP strings (they will be replaced on first sync)

---

### Task 3 — Player HLS-first, no loop

#### [MODIFY] [src/components/video/LiveVideoPlayer.tsx](file:///c:/Users/Admin/Downloads/ivmap_-intelligent-video-management-and-analytics-platform-for-unified-cctv-intelligence/src/components/video/LiveVideoPlayer.tsx)

- Remove `loop` from `<video>` element
- Remove the `isRtsp` full banner (L304–324). Replace with a small, unobtrusive note only shown when `!streamUrl && !isWebcamActive` (camera has no URL at all yet)
- The existing HLS path remains the primary path — it already works when `streamUrl` is an `http://…m3u8` URL. After Task 2, all grid cameras have HLS URLs, so this "just works"

---

### Task 4 — HLS Error Handler with Exponential Backoff

#### [MODIFY] [src/components/video/LiveVideoPlayer.tsx](file:///c:/Users/Admin/Downloads/ivmap_-intelligent-video-management-and-analytics-platform-for-unified-cctv-intelligence/src/components/video/LiveVideoPlayer.tsx)

Replace the two-line error handler with:

```typescript
const [reconnectMsg, setReconnectMsg] = useState<string | null>(null);
let backoffMs = 2000;  // starts at 2 s
let backoffTimer: ReturnType<typeof setTimeout> | null = null;

hls.on(Hls.Events.ERROR, (_evt, data) => {
  if (!data.fatal) {
    // Non-fatal: normal on mid-GOP join; log only, never surface
    console.debug('[HLS] non-fatal', data.type, data.details);
    return;
  }
  if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
    hls.startLoad();  // retry network
  } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
    hls.recoverMediaError();
  } else {
    // Unrecoverable — teardown and reinit with backoff
    hls.destroy();
    setIsPlayingLive(false);
    setReconnectMsg(`Reconnecting in ${Math.round(backoffMs / 1000)}s…`);
    backoffTimer = setTimeout(() => {
      setReconnectMsg(null);
      backoffMs = Math.min(backoffMs * 2, 30000);
      // reinitialize: re-run the whole HLS init block
    }, backoffMs);
  }
});
```

The "reconnecting…" state is shown as a calm overlay badge in the player UI — not a hard error screen, never a tight loop.

---

### Task 5 — Live polling in Camera Registry

#### [MODIFY] [src/pages/CameraRegistry.tsx](file:///c:/Users/Admin/Downloads/ivmap_-intelligent-video-management-and-analytics-platform-for-unified-cctv-intelligence/src/pages/CameraRegistry.tsx)

- Add a `useEffect` interval (20 s) that calls `GET /api/live-grid/cameras` and then refreshes the camera list via `api.getCameras()`
- Add a **"Sync from Grid"** button next to the existing "Refresh Registry" and "Add New Camera" buttons that calls `POST /api/live-grid/sync` (see server.ts addition below) and then reloads cameras
- Render `cam.fps`, `cam.resolution`, `cam.codec` from live data — they already render via `{cam.fps || 30}` and `{cam.resolution || '4K UHD'}` so they naturally pick up updated values

Add to `server.ts`:
```
POST /api/live-grid/sync
```
Calls `db.syncCamerasFromGrid()` with a fresh catalogue fetch, returns `{ synced, total }`.

---

### Task 6 — Fix the connection guide modal

#### [MODIFY] [src/components/modals/LiveStreamGuideModal.tsx](file:///c:/Users/Admin/Downloads/ivmap_-intelligent-video-management-and-analytics-platform-for-unified-cctv-intelligence/src/components/modals/LiveStreamGuideModal.tsx)

Replace Tab 1 (RTSP/MediaMTX generic guide) with a **"Shared CCTV Grid"** tab describing:
- Catalogue endpoint: `GET ${CCTV_GRID_HOST}/api/ingest`
- The three real URL patterns (RTSP for AI only, WHEP for low-latency, HLS for browser/dashboard)
- Grid rules (TCP RTSP, PTS timing, reconnect backoff, mid-GOP join warnings are normal, no download, no publish)
- How IVMAP auto-syncs from the grid and how to trigger a manual sync

Update Tab 4 (Python Edge Ingestion): Fix the endpoint from the non-existent `/api/pipeline/ingest` to the real `/api/sightings` (camelCase fields, as shown in `server.ts`). Add a note that field names differ from the Python FastAPI backend — reference `docs/BACKEND_DECISION.md`.

Keep Tab 2 (Webcam) and Tab 3 (HLS/MP4) as-is (they're accurate).

---

### Task 8 — Backend fork documentation

#### [NEW] [docs/BACKEND_DECISION.md](file:///c:/Users/Admin/Downloads/ivmap_-intelligent-video-management-and-analytics-platform-for-unified-cctv-intelligence/docs/BACKEND_DECISION.md)

Documents side-by-side:
- This Express server: `/api/sightings` POST with camelCase fields
- Python FastAPI (Caught-In-4K): `/api/v1/sightings` POST with snake_case fields
- States that neither currently bridges to the other
- Flags the team decision required before wiring real AI detections
- Notes WHEP/WebRTC as a future lower-latency browser option

---

## Guardrails (Task 7 — enforced throughout)

- No download/save affordance added anywhere
- No gateway control endpoint called from any code
- `hls.destroy()` is called on component unmount (already in existing `return () => hls.destroy()` cleanup — we preserve and extend this)
- The proxy route is `GET`-only and only reads `/api/ingest`
- The `syncCamerasFromGrid` function only reads the catalogue, never publishes

---

## Verification Plan

### Automated
```powershell
# After setting CCTV_GRID_HOST in .env:
curl http://localhost:3000/api/live-grid/cameras
# Second request within 8 s should respond instantly from cache (log: "[live-grid] cache hit")
curl http://localhost:3000/api/live-grid/cameras

# Confirm cameras show HLS URLs after sync:
curl http://localhost:3000/api/cameras | jq '.[].streamUrl'

# Manual sync:
curl -X POST http://localhost:3000/api/live-grid/sync
```

### Manual
1. Open Camera Registry → click "Sync from Grid" → verify cameras show real HLS URLs, not `rtsp://cam0N.internal.ivmap/…`
2. Open Live Monitoring → confirm a real HLS stream plays in `hls.js`
3. Point `CCTV_GRID_HOST` at a bad host → confirm player shows "reconnecting…" with growing delays, not a crash
4. Restore correct host → confirm player recovers automatically

### What requires the real grid host
Items 1-4 above require `CCTV_GRID_HOST` to point at the real grid. All code changes can be made and verified structurally without it; visual stream playback and sync can only be end-to-end verified once the host is reachable.

---

## Open Questions

> [!IMPORTANT]
> **Grid catalogue field names**: The spec says the catalogue returns `id`, `location`, `codec`, `status`, and stream URLs. What are the exact field names in the `/api/ingest` JSON response? For example: is the HLS URL at `hls_url`, `hlsUrl`, or nested under `streams.hls`? I'll write the sync code defensively to handle both camelCase and snake_case and fall back to constructing the URL from the pattern `${CCTV_GRID_HOST}/live/stream/<id>/index.m3u8`, but knowing the exact shape would let me map fields precisely.

> [!IMPORTANT]
> **`CCTV_GRID_HOST` value**: What is the actual hostname/IP? I'll add the `.env` key but leave the value empty for you to fill in.
