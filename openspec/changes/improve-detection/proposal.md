## Why

The current app has two accuracy problems: (1) `applyMaxZoom` applies `zoom.max` from `getCapabilities()`, which on Android can include digital zoom far beyond the optical range, producing a blurry, noisy image that makes detection worse; (2) the blob detection pipeline uses a fixed luminance threshold and a naive centroid-motion filter, which generates many false positives under varying lighting and camera shake.

## What Changes

- **Optical zoom cap**: Add an `OPTICAL_ZOOM_CAP = 5` constant; clamp `zoom.max` to this ceiling before applying. On iPhone 17 this is irrelevant (Safari reports optical max = 2), but on Android it prevents 10×+ digital zoom from being applied.
- **Adaptive threshold (Otsu's method)**: Replace the fixed threshold of 80 with per-frame Otsu's algorithm computed on the grayscale histogram. Adapts automatically to ambient lighting.
- **Frame-difference motion detection**: Replace the centroid-distance motion filter with pixel-level absolute frame differencing. Diff pixels that exceed a threshold indicate true motion; BFS runs only on those pixels. Eliminates false positives from static objects and camera jitter.
- **Slightly higher processing resolution**: Increase from 96×72 to 128×96 px to improve blob quality without significant performance cost.
- **Tighter blob shape filter**: Narrow aspect ratio from 0.15–12.0 to 0.2–7.0; mosquitoes are compact-to-elongated but not extreme.

## Capabilities

### New Capabilities

*(none — all changes are improvements to existing capabilities)*

### Modified Capabilities

- `camera-max-zoom`: Zoom is now capped at `OPTICAL_ZOOM_CAP` (5×) to prevent digital zoom from being applied on Android devices
- `web-mosquito-detection`: Detection now uses Otsu adaptive threshold + frame-difference motion filter + higher processing resolution + tighter shape filter

## Impact

- `mosquito-detector-web/app.js` — constants, `applyMaxZoom()`, `toGrayscaleMask()`, `motionFilter()` replaced; `detect()` updated for new resolution
- Processing resolution constant change affects offscreen canvas size (created at startup)
- No HTML/CSS changes; no new dependencies
