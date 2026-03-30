## 1. applyMaxZoom Helper (`app.js`)

- [x] 1.1 Add `applyMaxZoom(stream)` function: get the first video track from the stream, call `track.getCapabilities()`, check for `capabilities.zoom?.max`, and if present call `track.applyConstraints({ advanced: [{ zoom: capabilities.zoom.max }] }).catch(() => {})` — fire-and-forget with swallowed error
- [x] 1.2 Guard against browsers that do not implement `getCapabilities` (return early if `typeof track.getCapabilities !== 'function'`)

## 2. Apply Zoom in Camera Start Paths (`app.js`)

- [x] 2.1 In `startCamera()`, call `applyMaxZoom(s)` immediately after `await video.play()` and before `resizeOverlay()` — pass the stream object `s`
- [x] 2.2 In `startCameraFallback()`, call `applyMaxZoom(s)` immediately after `await video.play()` and before `resizeOverlay()` — same pattern as primary path

## 3. Validation

- [x] 3.1 Verify JS syntax with `node --check app.js`
- [ ] 3.2 Test on a device with zoom support (e.g., Android Chrome): confirm the camera view is visibly zoomed in after tapping Start
- [ ] 3.3 Test Flip Camera: confirm zoom is reapplied after switching rear ↔ front
- [ ] 3.4 Test on a browser without zoom support (e.g., desktop Chrome): confirm no error appears and the app works normally at default zoom
