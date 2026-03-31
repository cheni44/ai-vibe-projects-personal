## Context

The existing `app.js` runs a `requestAnimationFrame` loop that calls `detect()` each frame, immediately draws a red rectangle for any confirmed blob, and plays audio for any proximity score > 0. There is no concept of blob lifetime — every frame is treated independently after the motion filter. This leads to brief visual flashes and audio bursts from transient detections (dust, shadows, reflections) that survive the 1.5 px motion filter but disappear within a frame or two.

## Goals / Non-Goals

**Goals:**
- Track how long each detected blob has been continuously visible
- Promote a blob to "stable" only after ≥ 1 000 ms of continuous presence
- Draw a red circle (not a rectangle) on the overlay for stable blobs only
- Play audio only when ≥ 1 stable blob exists; silence immediately when none
- Keep all logic inside `app.js`; no HTML/CSS changes required

**Non-Goals:**
- Multi-target tracking with unique IDs (overkill for v1)
- Smooth circle animation / growing ring effects (nice-to-have for v2)
- Persisting tracker state across camera restarts (reset on stop/flip is fine)

## Decisions

### D1 — Time-based stability threshold (not frame-count-based)

**Decision**: Use `Date.now()` timestamps (`firstSeenMs`) rather than counting frames to determine the 1 s threshold.

**Rationale**: Frame rate varies across devices (30–60 fps). A 1 000 ms wall-clock timer guarantees consistent UX regardless of device speed. Frame-counting at 30 fps would require counting 30 frames, but on a 60 fps desktop that would only be 500 ms — inconsistent.

---

### D2 — Centroid-grid key for blob identity

**Decision**: Identify blobs across frames using a grid-quantised centroid key: `key = \`${Math.round(cx / GRID)},${Math.round(cy / GRID)}\`` where `GRID = 8` px (at processing resolution).

**Rationale**: Simple, O(1) lookup per blob. Grid cell of 8 px (at 96×72 px processing canvas) corresponds to ~53 px in a 640 px wide display — large enough to absorb centroid jitter between frames, small enough to distinguish nearby blobs.

**Alternatives considered**:
- Nearest-neighbour linear search: O(n²), fine for ≤ 5 blobs but unnecessarily complex.
- Kalman filter tracking: Accurate but overkill; adds significant code for marginal gain.

---

### D3 — Circle geometry derived from bounding box

**Decision**: Draw an ellipse (or circle) whose radius = `max(bbox.w, bbox.h) / 2 * 1.3` at the blob centroid, scaled to display resolution.

**Rationale**: The bounding box of a mosquito blob is roughly square; taking the larger dimension and adding 30 % padding gives a circle that comfortably encloses the blob. Using `ctx.arc()` is simpler than `ctx.ellipse()` and sufficient for a circular indicator.

---

### D4 — Stable tracker stored in module-level `Map`

**Decision**: Use a `Map<string, {firstSeenMs, lastSeenMs, blob}>` called `stableTracker` as module-level state in `app.js`. Clear it on `stopCamera` / `flipCamera` / `detector.reset()` calls.

**Rationale**: Fits naturally alongside existing module-level state (`prevBlobs`, `audioAlert`, etc.). No new class needed.

---

### D5 — Audio gate: stable blobs only

**Decision**: In the animation loop, compute `stableDetections = getStableDetections()`, then pass `score > 0` to `updateAudio` only when `stableDetections.length > 0`. The existing `SILENCE_MS` (1 s fade) is retained.

**Rationale**: Reuses existing `updateAudio` and silence-timeout logic unchanged. The only change is replacing the input condition.

## Risks / Trade-offs

- **[Risk] Blob jitter causes repeated promotion resets** → Mitigation: GRID=8 absorbs small centroid movement; blobs that leave the grid cell and re-enter reset their timer, but this is acceptable given mosquito movement patterns.
- **[Risk] 1 s delay feels too slow to users** → Mitigation: The threshold is a single named constant `STABLE_MS = 1000`; easy to tune. Users can also adjust sensitivity to filter more noise.
- **[Risk] Stale entries accumulate in `stableTracker`** → Mitigation: Entries are evicted when `Date.now() - lastSeenMs > EVICT_MS` (500 ms); Map size stays bounded by the number of active blobs.

## Migration Plan

All changes are isolated to `app.js`. The existing bounding-box rendering (`renderOverlay`) is replaced with a circle renderer. No breaking API changes. Rollback = revert the single commit.

## Open Questions

- Should a "warming up" visual indicator (e.g., partial arc) be shown during the 0–1 s ramp? Deferred to v2 to keep this change minimal.
