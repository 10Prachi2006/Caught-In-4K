# IVMAP → Real CCTV Grid Integration — Walkthrough

## Build Status

✅ **`npm run build` exits 0** — 1701 modules transformed, `dist/index.html` + `dist/server.cjs` emitted.
The only output is a pre-existing chunk-size advisory (not an error).

---

## Files Changed / Added

### Modified

| File | What changed |
|---|---|
| [`server.ts`](file:///c:/Users/Admin/Downloads/ivmap_-intelligent-video-management-and-analytics-platform-for-unified-cctv-intelligence/server.ts) | Task 1: `CCTV_GRID_HOST` env var; 8 s in-memory cache; `GET /api/live-grid/cameras`; `POST /api/live-grid/sync`; startup sync on listen |
| [`src/server/db.ts`](file:///c:/Users/Admin/Downloads/ivmap_-intelligent-video-management-and-analytics-platform-for-unified-cctv-intelligence/src/server/db.ts) | Task 2: 6 fake `rtsp://cam0N.internal.ivmap/…` URLs → `''`; `createCamera()` default URL → `''`; added `GridCameraEntry` interface + `syncCamerasFromGrid()` export |
| [`src/components/video/LiveVideoPlayer.tsx`](file:///c:/Users/Admin/Downloads/ivmap_-intelligent-video-management-and-analytics-platform-for-unified-cctv-intelligence/src/components/video/LiveVideoPlayer.tsx) | Task 3 + 4: removed `loop`; removed RTSP banner; added `reconnectMsg` state; full exponential-backoff HLS error handler; page-visibility teardown |
| [`src/pages/CameraRegistry.tsx`](file:///c:/Users/Admin/Downloads/ivmap_-intelligent-video-management-and-analytics-platform-for-unified-cctv-intelligence/src/pages/CameraRegistry.tsx) | Task 5: `syncFromGrid()` function; 20 s polling interval; "Sync from Grid" button |
| [`src/components/modals/LiveStreamGuideModal.tsx`](file:///c:/Users/Admin/Downloads/ivmap_-intelligent-video-management-and-analytics-platform-for-unified-cctv-intelligence/src/components/modals/LiveStreamGuideModal.tsx) | Task 6: Tab 1 → shared grid guide (catalogue-first, 3 URL patterns, all grid rules); Tab 4 → endpoint fixed to `/api/sightings`, two-backend warning added |
| [`.env`](file:///c:/Users/Admin/Downloads/ivmap_-intelligent-video-management-and-analytics-platform-for-unified-cctv-intelligence/.env) | Added `CCTV_GRID_HOST=` placeholder |
| [`.env.example`](file:///c:/Users/Admin/Downloads/ivmap_-intelligent-video-management-and-analytics-platform-for-unified-cctv-intelligence/.env.example) | Documented `CCTV_GRID_HOST` with full usage notes |

### Added

| File | Purpose |
|---|---|
| [`docs/BACKEND_DECISION.md`](file:///c:/Users/Admin/Downloads/ivmap_-intelligent-video-management-and-analytics-platform-for-unified-cctv-intelligence/docs/BACKEND_DECISION.md) | Task 8: side-by-side contract comparison (Express camelCase vs FastAPI snake_case), 3 resolution options, WHEP future note, RTSP AI pipeline spec |

---

## Verification Steps Used

### 1. No fake RTSP URLs remain
```
grep -r "rtsp://cam" src/   → No results ✓
grep -r "api/pipeline/ingest" src/  → No results ✓
grep "loop" src/components/video/LiveVideoPlayer.tsx  → No results ✓
```

### 2. Build passes
```
npm run build  → exit code 0, ✓ 1701 modules transformed
```

### 3–5. Require a live grid host
The following can only be confirmed once `CCTV_GRID_HOST` is set to the real host in `.env`:

| Check | How to verify |
|---|---|
| Catalogue proxy + cache | `curl http://localhost:3000/api/live-grid/cameras` → real cameras; second request within 8 s shows `[live-grid] cache hit` in server log |
| Cameras show HLS URLs after sync | Camera Registry → "Sync from Grid" → check `streamUrl` values in rows (should be `http://.../live/stream/.../index.m3u8`) |
| HLS stream plays end-to-end | Live Monitoring → camera card → HLS feed plays in browser |
| Backoff on connectivity loss | Set `CCTV_GRID_HOST=http://localhost:9` (bad port) → player shows amber "Reconnecting in 2s…" → then "4s…" → "8s…" → never faster; restore host → recovers |
| No control/download code paths | Audit: `grep -r "publish\|PUT.*stream\|wget\|curl.*stream" src/` → no results |

---

## HLS Error Handler — How It Works Now

```
hls.on(Hls.Events.ERROR, (_evt, data) => {
  if (!data.fatal) {
    console.debug(...)  // mid-GOP join warnings → silent
    return;
  }
  if (NETWORK_ERROR) → hls.startLoad()     // low-cost retry
  if (MEDIA_ERROR)   → hls.recoverMediaError()  // codec recovery
  else → destroyHls() + setTimeout(initHls, backoffMs)
         backoffMs = min(backoffMs * 2, 30000)  // 2→4→8→…→30 s
         backoffMs resets to 2 s on MANIFEST_PARSED (success)
})
```

The `reconnectMsg` state drives an amber badge overlay — never a hard error screen.

---

## What Cannot Be Verified Without the Grid Host

- Actual HLS stream playback (requires real `CCTV_GRID_HOST`)
- Real catalogue shape (field names confirmed defensively via dual camelCase/snake_case mapping)
- Codec/FPS display update after sync (logic is correct; needs real catalogue data to render)
- Recovery from hard scene cut at recording loop point (logic handles it; needs live feed to trigger)

---

## docs/BACKEND_DECISION.md Content

See [`docs/BACKEND_DECISION.md`](file:///c:/Users/Admin/Downloads/ivmap_-intelligent-video-management-and-analytics-platform-for-unified-cctv-intelligence/docs/BACKEND_DECISION.md) — side-by-side contract, 3 resolution options, WHEP roadmap, RTSP AI pipeline spec.
