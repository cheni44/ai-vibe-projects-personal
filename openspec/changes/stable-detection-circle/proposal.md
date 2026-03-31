## Why

The current mosquito detector draws a bounding box and plays audio on every transient detection — including single-frame noise and fast-moving shadows — causing many false alarms. Users need confirmation that a real mosquito is present before being disturbed by the buzz sound. Requiring 1 second of continuous detection before showing an overlay and sounding the alert dramatically reduces false positives and makes the experience trustworthy.

## What Changes

- Introduce a **stable-detection tracker** that maintains per-blob persistence state: a blob must be continuously detected for ≥ 1 second before being considered "stable"
- **Replace the bounding-box rectangle** with a **circle overlay** for stable blobs only; transient (< 1 s) blobs produce no overlay
- **Gate audio on stable detections**: the buzz sound only plays when at least one stable blob is present; it stops immediately when no stable blob exists
- Remove the previous behaviour of drawing rectangles on every detected frame

## Capabilities

### New Capabilities

- `stable-detection-tracker`: Per-blob persistence tracking across frames — maps detected blobs to a lifetime timer, promotes blobs to "stable" after ≥ 1 000 ms of continuous presence, and expires blobs that disappear for > 500 ms

### Modified Capabilities

- `web-detection-ui`: Overlay changes from red rectangle (every detection) to red circle (stable detections only, ≥ 1 s); no visual indicator for transient blobs
- `web-audio-alert`: Audio is now gated — buzz only plays when at least one stable detection exists; silences immediately (with existing 1 s fade) when no stable blob is present

## Impact

- **`mosquito-detector-web/app.js`**: Add stable tracker state and logic; update `renderOverlay` to draw circles; update audio gate condition
- **No changes** to HTML, CSS, detection engine, or camera modules
- **No new dependencies**
