## Context

The current detection pipeline runs at 96×72 px, uses a fixed luminance threshold of 80, and detects motion by comparing centroid positions between frames. These three choices interact poorly:
- A fixed threshold of 80 works in a well-lit room but fails in dim environments (too many foreground pixels) or overly bright environments (too few).
- The centroid-motion filter accepts all "new arrivals" (blobs with no nearby predecessor), so any speck of noise that didn't exist in the prior frame passes through unchallenged.
- 96×72 px means a 3×3 px blob represents ~1 mm of a mosquito at arm's length — barely distinguishable from JPEG noise.

## Goals / Non-Goals

**Goals:**
- Adaptive per-frame threshold via Otsu's algorithm (grayscale histogram)
- Replace centroid motion filter with pixel-level absolute frame differencing
- Raise processing canvas to 128×96 px
- Tighten aspect-ratio filter (0.2–7.0)
- Cap optical zoom at `OPTICAL_ZOOM_CAP = 5` to avoid digital zoom on Android

**Non-Goals:**
- Machine-learning-based classifier (no dependencies allowed)
- Background modelling / Gaussian mixture model (too complex for this stage)
- Per-device zoom calibration

## Decisions

### Decision 1 — Otsu's method for adaptive thresholding

Otsu's algorithm finds the threshold that maximises inter-class variance of a grayscale histogram. It is O(256) per frame (trivial), purely functional, and requires no state. This replaces the hard-coded `threshold = 80` in `toGrayscaleMask()`.

**Alternative considered:** Rolling average brightness → threshold at `mean × 0.6`. Simpler but doesn't handle bimodal distributions well (e.g., backlit scenes).

### Decision 2 — Pixel-level absolute frame differencing for motion

Instead of filtering by centroid distance, we:
1. Store the previous frame's grayscale pixel array
2. Compute `|currentGray[i] - prevGray[i]|` for every pixel
3. Build a boolean motion mask where diff ≥ `DIFF_THRESHOLD = 15`
4. BFS on `motionMask AND foregroundMask` — only blobs that are both dark AND moving

This eliminates static false positives entirely, including camera-shake artefacts (since shaking moves ALL pixels uniformly, blurring the diff).

**Implementation note:** `prevGrayFrame` is a `Float32Array(128×96)` stored in module state; it's cleared on Stop/Flip alongside `prevBlobs` and `stableTracker`.

**Alternative considered:** Keep centroid motion filter, add a "seen in N consecutive frames" counter. More complex state, still susceptible to stable noise.

### Decision 3 — 128×96 processing resolution

78% more pixels than 96×72; still under 12,300 pixels so BFS is fast (<1 ms on modern mobile). The offscreen canvas is sized once at module load, so only the constant needs changing.

**Alternative considered:** 160×120 — 2.5× current area; borderline for frame budget on older Android.

### Decision 4 — Optical zoom cap at 5×

`MediaStreamTrack.getCapabilities().zoom.max` on iOS Safari reflects only optical zoom (iOS enforces this). On Android Chrome it may report 10–20× (digital). Capping at 5× prevents the blurry digital-zoom image that degrades detection. 5 is chosen because the current telephoto flagship zoom is 5× (iPhone 15 Pro Max), so legitimate optical zoom should never exceed this in the near future.

**Alternative considered:** Platform detection + per-platform cap. More fragile, not worth it when a simple cap suffices.

## Risks / Trade-offs

- **[Risk]** Otsu's method may return a very low threshold on a nearly-uniform frame (e.g., pointing at blank wall) → whole wall becomes foreground → many blobs. **Mitigation:** Clamp Otsu result to `[30, 150]` range; the frame-diff mask further filters to only moving blobs.
- **[Risk]** Frame differencing is sensitive to sudden lighting changes (flash, light switch) → single-frame noise spike. **Mitigation:** Stable tracker's 1s gate absorbs these transient spikes.
- **[Risk]** `prevGrayFrame` adds ~12 KB of Float32Array heap per tab. **Mitigation:** Negligible on any device capable of running the app.
- **[Trade-off]** Frame diff masks require that the first frame after Start always returns zero detections (prev is empty). This is identical to existing behaviour.
