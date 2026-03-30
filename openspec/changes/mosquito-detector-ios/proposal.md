## Why

Mosquitoes are a persistent nuisance and health hazard, yet detecting them in real time is difficult without dedicated hardware. This change introduces a Pythonista 3 iOS app that leverages the device's built-in camera and audio system to detect mosquitoes visually and warn the user with proximity-based audio alerts — no additional hardware required.

## What Changes

- Introduce a new iOS app written in Pythonista 3 using the `objc_util` and `scene`/`ui` modules
- Integrate camera capture for real-time frame analysis
- Add a mosquito detection engine (image-based heuristics or lightweight ML model) to identify mosquitoes in camera frames
- Add a proximity audio alert system that plays a mosquito-buzzing sound whose volume scales with the detected mosquito's apparent size / closeness
- Provide a minimal UI: live camera preview with detection overlay and volume/sensitivity controls

## Capabilities

### New Capabilities

- `camera-capture`: Continuous camera frame capture pipeline using Pythonista 3 on iOS, exposing frames for downstream processing
- `mosquito-detection`: Per-frame detection logic that identifies mosquito-like objects (small dark fast-moving insects) and estimates proximity from apparent bounding-box size
- `proximity-audio-alert`: Audio alert subsystem that plays a looping mosquito-buzz sound and modulates volume proportionally to detected proximity; silences when no mosquito is detected
- `detection-ui`: Live camera preview view with bounding-box overlay, proximity meter, and user-adjustable sensitivity control

### Modified Capabilities

## Impact

- **Platform**: iOS only, runs inside Pythonista 3 (Python 3.x runtime)
- **Dependencies**: Pythonista 3 built-in modules (`objc_util`, `ui`, `scene`, `sound`, `photos`); optionally `PIL`/`Pillow` (available in Pythonista) for image processing; no external network calls required
- **Hardware**: Rear/front camera, device speaker or headphones
- **No existing code is modified** — this is a standalone new project in the repository
