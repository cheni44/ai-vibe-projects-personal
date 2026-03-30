## Context

The app runs entirely inside Pythonista 3 on iOS. Pythonista exposes `objc_util` for bridging to native Objective-C APIs, `ui` for views, `sound` for audio playback, and `photos`/`AVFoundation` (via `objc_util`) for camera access. There is no server component — all processing happens on-device. The target user is someone who wants a quick, low-friction way to detect nearby mosquitoes without dedicated hardware.

## Goals / Non-Goals

**Goals:**
- Real-time camera frame capture at a usable frame rate (≥10 fps) inside Pythonista 3
- On-device mosquito detection using image-processing heuristics (no cloud inference)
- Proximity estimation based on detected bounding-box size
- Audio alert whose volume scales continuously with proximity; silent when no mosquito present
- Clean, usable UI with live preview, detection overlay, and sensitivity slider

**Non-Goals:**
- Species identification or scientific accuracy
- Background / lock-screen operation (Pythonista 3 limitation)
- Android or other platforms
- Training custom ML models (out of scope for v1; heuristics only)
- Multi-mosquito tracking across frames

## Decisions

### D1 — Camera access via AVFoundation through `objc_util`

**Decision**: Use `objc_util` to access `AVCaptureSession` natively rather than relying on Pythonista's `photos.capture_image()` (which is interactive and blocking).

**Rationale**: Continuous frame delivery requires a delegate callback pattern (`AVCaptureVideoDataOutput` + `setSampleBufferDelegate`). `objc_util` allows wrapping this in Python. Alternative — using a `ui.ImageView` refresh loop with screenshot grabs — is too slow and doesn't give raw frames.

**Alternatives considered**:
- `photos.capture_image()`: Interactive, blocks UI — rejected.
- Third-party `cv2` (OpenCV): Not available in Pythonista 3 by default — rejected for v1.

---

### D2 — Mosquito detection via image heuristics (no ML model)

**Decision**: Detect mosquitoes using classical image-processing: convert frame to grayscale, background-subtract or threshold for dark moving blobs, filter by size (small) and aspect ratio (elongated), and apply a minimum movement delta between frames.

**Rationale**: Pythonista 3 does not have easy access to CoreML Python bindings or TensorFlow Lite. PIL/Pillow is available and sufficient for blob detection. Heuristics are fast enough for ≥10 fps on modern iPhones.

**Alternatives considered**:
- CoreML via `objc_util`: Feasible but requires a bundled `.mlmodel` file and complex bridging code — deferred to v2.
- OpenCV: Not available in Pythonista 3 standard library — rejected.

---

### D3 — Proximity estimation from bounding-box area

**Decision**: Estimate proximity as `proximity = detected_bbox_area / frame_area`. Normalize to [0, 1] with a configurable max-area threshold (e.g., 2 % of frame = "very close" → volume 1.0).

**Rationale**: Simple, fast, no depth sensor required. Works reasonably well for a single dominant mosquito.

---

### D4 — Audio alert using `sound.play_effect()` or looping `sound.Player`

**Decision**: Use a `sound.Player` instance with a pre-bundled mosquito-buzz `.wav` or `.mp3` file, adjusting `player.volume` each detection cycle.

**Rationale**: `sound.play_effect()` triggers one-shot sounds; continuous volume modulation requires `sound.Player`. The buzz audio file can be a short looping clip included in the project.

---

### D5 — UI built with `ui` module

**Decision**: Single `ui.View` with:
1. A `ui.ImageView` updated each frame with the annotated camera frame
2. A `ui.Slider` for detection sensitivity
3. A `ui.Label` for proximity readout

**Rationale**: Native Pythonista `ui` is straightforward and integrates well with the main thread. Frame updates are posted to the main thread via `objc_util.on_main_thread`.

## Risks / Trade-offs

- **[Risk] Frame rate may be insufficient on older devices** → Mitigation: Allow user to choose preview resolution (low/medium); default to `AVCaptureSessionPresetMedium`.
- **[Risk] Heuristic false positives (dust, hair, other small dark objects)** → Mitigation: Require motion between consecutive frames AND blob aspect ratio filter; expose sensitivity slider so user can tune.
- **[Risk] `objc_util` AVFoundation bridging is complex and fragile** → Mitigation: Isolate all native bridging in a single `camera.py` module; wrap with try/except and fallback to still-capture mode.
- **[Risk] Audio file licensing** → Mitigation: Generate synthetic buzz programmatically or use a public-domain clip bundled with the project.
- **[Risk] App may be killed by iOS when backgrounded** → Mitigation: Document that the app must stay in foreground; no background audio workaround needed for v1.

## Migration Plan

This is a new standalone project — no migration required. Steps to deploy:

1. Copy project files into Pythonista 3's local file system (via iCloud Drive or direct import).
2. Run `main.py` from Pythonista 3.
3. Grant camera and microphone permissions when prompted.

Rollback: Delete the project folder from Pythonista 3.

## Open Questions

- Should a synthetic buzz be generated in code (using raw audio samples) instead of bundling an audio file? This would remove the asset-management concern.
- Is `AVCaptureVideoDataOutput` reliably bridgeable in the current version of Pythonista 3 (3.4)? Needs a quick feasibility spike before full implementation.
- Should the detection overlay use `ui.View` subclass with `draw()` or simply annotate the PIL image before displaying? (PIL annotation is simpler; `draw()` is more responsive.)
