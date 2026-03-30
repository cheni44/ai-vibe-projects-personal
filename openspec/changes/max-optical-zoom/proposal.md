## Why

Mosquitoes are small — a zoomed-in camera feed makes them far easier to detect visually and improves the accuracy of the blob detection pipeline. Most modern phones support optical or digital zoom via the `MediaStream Image Capture API`; currently the app always uses the default (1×) zoom level, leaving usable magnification on the table.

## What Changes

- When the camera stream starts, query the track's zoom capability via `ImageCapture.getPhotoCapabilities()` (or `MediaStreamTrack.getCapabilities()`)
- If a `zoom` capability range is reported, immediately apply `track.applyConstraints({ advanced: [{ zoom: maxZoom }] })` to set the highest supported zoom
- Silently skip the step if the browser or device does not support zoom (no visible error)
- Reapply max zoom after every camera flip (rear ↔ front)

## Capabilities

### New Capabilities

- `camera-max-zoom`: Automatically apply the maximum supported zoom level to the active camera track after the stream is acquired; gracefully no-op if zoom is unsupported

### Modified Capabilities

- `web-camera-capture`: Add a requirement that the camera acquisition step attempts to apply maximum zoom immediately after the stream is obtained

## Impact

- `mosquito-detector-web/app.js` — `startCamera()` and `startCameraFallback()` gain a post-stream zoom-apply step
- No changes to HTML, CSS, detection engine, or audio
- No new dependencies; uses built-in browser APIs (`MediaStreamTrack.getCapabilities`, `applyConstraints`)
- Devices/browsers without zoom support are unaffected (graceful degradation)
