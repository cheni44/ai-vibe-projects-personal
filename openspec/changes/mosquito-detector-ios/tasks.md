## 1. Project Setup

- [x] 1.1 Create project directory structure (`main.py`, `camera.py`, `detector.py`, `audio_alert.py`, `ui_view.py`, `assets/`)
- [x] 1.2 Add a placeholder `README.md` with setup instructions (install into Pythonista 3 via iCloud Drive)
- [x] 1.3 Source or generate a short looping mosquito-buzz audio file (`assets/buzz.wav`) ≤2 s, public domain or synthetically generated

## 2. Camera Capture Module (`camera.py`)

- [x] 2.1 Implement `AVCaptureSession` setup via `objc_util` with `AVCaptureVideoDataOutput` and a Python-side delegate callback
- [x] 2.2 Convert each `CMSampleBuffer` to a PIL `Image` object and call registered frame-consumer callbacks
- [x] 2.3 Implement `start()` and `stop()` methods that start/stop the capture session and release resources
- [x] 2.4 Add support for selecting front vs. rear camera (`AVCaptureDevicePositionBack` / `Front`)
- [x] 2.5 Add configurable resolution preset (`low`/`medium`/`high` → `AVCaptureSessionPreset*`) defaulting to `medium`
- [x] 2.6 Handle camera permission denial gracefully (catch `AVAuthorizationStatusDenied`, raise descriptive exception)

## 3. Mosquito Detection Module (`detector.py`)

- [x] 3.1 Implement `preprocess(frame)`: convert PIL Image to grayscale, apply Gaussian blur (using PIL `ImageFilter`), then threshold to binary
- [x] 3.2 Implement blob detection: find connected components in thresholded image using a flood-fill or run-length approach; return list of `(bbox, area, aspect_ratio)` tuples
- [x] 3.3 Implement size and aspect-ratio filter: reject blobs outside configurable min/max area and aspect-ratio ranges (scaled by `sensitivity`)
- [x] 3.4 Implement inter-frame motion filter: store previous frame's blob positions; require ≥`motion_threshold` pixel delta for confirmation; reject static blobs after 3 consecutive static frames
- [x] 3.5 Implement `detect(frame, sensitivity) -> List[Detection]` returning `Detection(bbox, proximity_score)` for each confirmed mosquito
- [x] 3.6 Implement proximity calculation: `proximity = min(1.0, blob_area / frame_area / 0.02)` per spec
- [x] 3.7 Write unit-testable helper functions with docstrings; verify with at least two hand-crafted test images (synthetic blob present / absent)

## 4. Proximity Audio Alert Module (`audio_alert.py`)

- [x] 4.1 Implement `AudioAlert` class that loads `assets/buzz.wav` into a `sound.Player` with `number_of_loops = -1` (infinite loop)
- [x] 4.2 Implement `update(proximity_score)` method: if `proximity_score > 0`, set `player.volume = proximity_score` and call `player.play()` if not already playing; if `proximity_score == 0`, call `player.stop()` after a 1-second detection-timeout
- [x] 4.3 Implement `stop()` method that immediately halts playback and releases audio resources
- [x] 4.4 Handle missing audio asset gracefully (log warning; operate in silent mode rather than crash)

## 5. Detection UI (`ui_view.py`)

- [x] 5.1 Create `MosquitoDetectorView(ui.View)` with a `ui.ImageView` (camera preview), `ui.Label` (proximity readout), `ui.Slider` (sensitivity 0–1, default 0.5), and a `ui.Button` (camera switch)
- [x] 5.2 Wire the slider's `action` to update `detector.sensitivity` on each change
- [x] 5.3 Wire the camera-switch button's `action` to call `camera.switch_camera()` and update button label
- [x] 5.4 Implement `update_frame(pil_image, detections)`: annotate PIL image with red bounding boxes for each detection, convert to `ui.Image`, assign to `ui.ImageView.image` on the main thread via `objc_util.on_main_thread`
- [x] 5.5 Implement proximity meter update: set `ui.Label.text` to `f"Proximity: {int(score*100)} %"` or "None" when no detection
- [x] 5.6 Implement `will_close()` override to stop the camera capture session and audio alert

## 6. Main Entry Point (`main.py`)

- [x] 6.1 Instantiate `CameraCapture`, `MosquitoDetector`, `AudioAlert`, and `MosquitoDetectorView`
- [x] 6.2 Register a frame callback that calls `detector.detect()`, `audio_alert.update()`, and `view.update_frame()` for each delivered frame
- [x] 6.3 Start the capture session and present the view full-screen with `view.present('fullscreen')`
- [x] 6.4 Ensure clean shutdown: stop camera and audio when the view is dismissed

## 7. Integration & Manual Testing

- [ ] 7.1 Run the app in Pythonista 3 on a physical iOS device; verify camera preview is visible and updates at ≥10 fps
- [ ] 7.2 Test mosquito detection with a reference image (printed or on-screen) — confirm bounding box appears
- [ ] 7.3 Test audio alert: confirm buzz starts when a detection appears and stops after the 1-second timeout
- [ ] 7.4 Test proximity volume scaling: move a small dark object closer to the camera and confirm audio volume increases
- [ ] 7.5 Test sensitivity slider: verify that lowering sensitivity eliminates false positives in a clean background
- [ ] 7.6 Test camera-switch button: confirm front/rear toggle works without crash
- [ ] 7.7 Test camera permission denial: deny camera access in iOS Settings; confirm descriptive error is shown
