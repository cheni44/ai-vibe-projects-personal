## 1. Constants (`app.js`)

- [x] 1.1 Change `PROC_W = 128` and `PROC_H = 96` (was 96×72); update `FRAME_AREA = PROC_W * PROC_H`
- [x] 1.2 Add `OPTICAL_ZOOM_CAP = 5` constant alongside the other camera constants
- [x] 1.3 Add `DIFF_THRESHOLD = 15` constant for frame-difference motion detection
- [x] 1.4 Add module-level `let prevGrayFrame = null` alongside existing state variables; clear it (set to `null`) in Stop and Flip Camera handlers alongside `prevBlobs = []` and `stableTracker.clear()`

## 2. Optical Zoom Cap (`app.js`)

- [x] 2.1 In `applyMaxZoom()`, change the constraint value from `capabilities.zoom.max` to `Math.min(capabilities.zoom.max, OPTICAL_ZOOM_CAP)`

## 3. Adaptive Threshold — Otsu's Algorithm (`app.js`)

- [x] 3.1 Implement `otsuThreshold(grayArray)` — build a 256-bucket histogram, compute total mean, iterate over thresholds 0–255 to find the one maximising inter-class variance; return `Math.max(30, Math.min(150, bestThreshold))`
- [x] 3.2 Update `toGrayscaleMask(imageData)` to: (a) build a `Float32Array` of per-pixel luminance values, (b) call `otsuThreshold()` on that array to get the threshold, (c) produce the boolean mask using that threshold; return both `{ mask, grayArray }` so the caller can store `grayArray` as `prevGrayFrame`

## 4. Frame-Difference Motion Detection (`app.js`)

- [x] 4.1 Implement `frameDiffMask(currentGray, prevGray)` — returns a `Uint8Array` where `|currentGray[i] - prevGray[i]| >= DIFF_THRESHOLD` is 1, else 0
- [x] 4.2 Update `detect(imageData, sens, prevGrayFrame)` — replace the old `motionFilter()` call with: (a) call `toGrayscaleMask(imageData)` to get `{ mask, grayArray }`, (b) if `prevGrayFrame` is null return `{ detections: [], prevGrayFrame: grayArray }` (first-frame seed), (c) compute `diffMask = frameDiffMask(grayArray, prevGrayFrame)`, (d) compute `combinedMask = mask AND diffMask` (element-wise), (e) run `findBlobs` on `combinedMask`, (f) run `filterBlobs`, return `{ detections, prevGrayFrame: grayArray }`
- [x] 4.3 Remove the old `motionFilter()` function (it is fully replaced by frame differencing)

## 5. Tighter Blob Filter (`app.js`)

- [x] 5.1 In `filterBlobs()`, change `AR_MIN = 0.2` and `AR_MAX = 7.0` (was 0.15 and 12.0)

## 6. Wire New State into Animation Loop and Handlers (`app.js`)

- [x] 6.1 In `animationLoop()`, update the `detect()` call to pass `prevGrayFrame` instead of `prevBlobs`; store `result.prevGrayFrame` back to `prevGrayFrame`
- [x] 6.2 Remove all references to `prevBlobs` state that are no longer needed (the old detection pipeline used `prevBlobs`; the new one uses `prevGrayFrame`). Keep `prevBlobs` removal in Stop/Flip if it's still referenced elsewhere, otherwise remove the variable entirely.

## 7. Resize Offscreen Canvas (`app.js`)

- [x] 7.1 The offscreen canvas is sized `offscreen.width = PROC_W; offscreen.height = PROC_H` at module load — verify these use the updated constants (no code change needed if they already reference the constants; just confirm)

## 8. Validation

- [x] 8.1 Run `node --check app.js` — confirm zero syntax errors
- [ ] 8.2 Verify in browser (indoor lighting): point camera at small dark object, confirm circle still appears after 1 s
- [ ] 8.3 Verify in dim lighting: confirm circle appears where it previously failed or over-triggered
- [ ] 8.4 Verify static objects (e.g., a dark book on a table) do NOT trigger a detection circle
- [ ] 8.5 Verify on Android: confirm zoom is capped and image is not blurry/pixelated from digital zoom
