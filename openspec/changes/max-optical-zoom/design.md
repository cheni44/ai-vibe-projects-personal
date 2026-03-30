## Context

The web app calls `getUserMedia()` and begins the detection loop without ever touching the camera's zoom capability. Modern mobile browsers (Chrome for Android, Safari 15.4+ on iOS) expose zoom control via `MediaStreamTrack.getCapabilities()` and `MediaStreamTrack.applyConstraints({ advanced: [{ zoom }] })`. Desktop browsers and older mobile browsers silently omit the `zoom` field from capabilities — so any implementation must degrade gracefully.

Current flow:
```
getUserMedia() → video.play() → resizeOverlay() → return stream
```

Target flow:
```
getUserMedia() → video.play() → applyMaxZoom(track) → resizeOverlay() → return stream
```

## Goals / Non-Goals

**Goals:**
- Automatically apply the highest reported zoom level immediately after stream acquisition
- Work on both the primary (`startCamera`) and fallback (`startCameraFallback`) paths
- Reapply after every camera flip (rear ↔ front switches create a new track)
- Fail silently (no user-visible error) on unsupported browsers/devices

**Non-Goals:**
- User-controllable zoom slider — not in scope
- Persisting a user-chosen zoom level across sessions
- Supporting `ImageCapture.getPhotoCapabilities()` (deprecated, inconsistent across browsers)
- Changing the offscreen canvas processing resolution (zoom changes the optical image, not the pipeline)

## Decisions

### Decision 1 — Use `MediaStreamTrack.getCapabilities()` not `ImageCapture`

`ImageCapture.getPhotoCapabilities()` is deprecated and not universally supported. The `getCapabilities()` method on the video track is the modern, standards-track approach and is available in Chrome for Android 59+ and Safari 15.4+.

**Alternative considered:** `ImageCapture` API — rejected due to deprecation and inconsistent support.

### Decision 2 — Fire-and-forget `applyConstraints`, do not await

`applyConstraints` returns a Promise. We call it and attach a `.catch()` to swallow errors, but do **not** `await` it before returning the stream. This avoids adding latency to camera startup for users on unsupported devices (where the Promise may reject or take time). The detection loop starts immediately; zoom kicks in within one round-trip.

**Alternative considered:** `await applyConstraints` — rejected; adds startup latency on all devices.

### Decision 3 — Always apply maximum zoom

The user's request is explicit: use the maximum optical zoom. No user-facing UI control is needed. We read `capabilities.zoom.max` and apply it directly.

**Alternative considered:** Configurable zoom slider — rejected; out of scope for this change.

## Risks / Trade-offs

- **[Risk]** `applyConstraints` rejects even though `getCapabilities` reports zoom → Mitigation: `.catch(() => {})` silences the error; detection continues at 1× zoom.
- **[Risk]** Front camera may report a different (or no) zoom range than rear → Mitigation: `applyMaxZoom` runs independently on each new track, handles missing capability gracefully.
- **[Risk]** Safari iOS reports `zoom` in capabilities but ignores `applyConstraints` silently → Mitigation: No visible impact; the app still works at 1× zoom.
- **[Trade-off]** Processing still runs at 96×72 px regardless of zoom level — a zoomed-in optical image fills the sensor, so the detection pipeline benefits from the zoom without any code change to the detector.
