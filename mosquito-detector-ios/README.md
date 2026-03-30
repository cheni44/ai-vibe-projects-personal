# Mosquito Detector — Pythonista 3 iOS App

Real-time mosquito detection using the device camera, with proximity-based audio alerts. The closer the mosquito, the louder the buzz.

## Requirements

- **Pythonista 3** (v3.4+) on iPhone or iPad — [App Store](https://apps.apple.com/app/pythonista-3/id1085978097)
- iOS 14 or later
- Rear or front camera
- Speaker or headphones

> This app **cannot** run on a Mac or in a simulator. It must run inside Pythonista 3 on a physical iOS device.

## Installation

### Option A — iCloud Drive (recommended)

1. On your Mac, copy the `mosquito-detector-ios/` folder into:
   ```
   iCloud Drive / Pythonista 3 / Documents/
   ```
2. On your iOS device, open **Pythonista 3** → **Files** → find the `mosquito-detector-ios` folder.
3. Tap `main.py` to open it, then tap ▶ (Run) to start.

### Option B — Direct transfer via AirDrop or cable

1. AirDrop the project folder to your iPhone/iPad.
2. In the iOS Files app, move it to **On My iPhone → Pythonista 3**.
3. Open Pythonista 3, navigate to the folder, and run `main.py`.

## Permissions

On first run, iOS will ask for **Camera** access. Tap **Allow**.  
If you accidentally deny it: **Settings → Privacy & Security → Camera → Pythonista 3** → toggle On.

## Files

| File | Purpose |
|------|---------|
| `main.py` | Entry point — wires all modules together and starts the app |
| `camera.py` | AVFoundation camera capture via `objc_util` |
| `detector.py` | Image-processing mosquito detection (PIL + numpy heuristics) |
| `audio_alert.py` | Proximity-scaled looping audio alert |
| `ui_view.py` | Main UI: live preview, detection overlay, controls |
| `assets/buzz.wav` | Short looping mosquito-buzz sound (synthetic) |

## Usage

| Control | Action |
|---------|--------|
| **Camera preview** | Live feed with red bounding box around detected mosquitoes |
| **Proximity label** | Shows estimated proximity 0–100 % |
| **Sensitivity slider** | Left = fewer false positives; Right = catch more (smaller) mosquitoes |
| **🔄 Flip camera** | Toggle front / rear camera |

## How Detection Works

1. Each camera frame is downsampled to 128 × 96 px for speed.
2. The frame is converted to grayscale and thresholded to highlight **small dark blobs**.
3. A **motion filter** rejects blobs that haven't moved in the last 3 frames (dust, hairs, etc.).
4. Remaining blobs are filtered by **size and aspect ratio** (scaled by the sensitivity slider).
5. **Proximity** is estimated from the blob's bounding-box area relative to the frame area.
6. Audio volume = proximity score (0.0 – 1.0).

## Limitations

- Heuristic detector — not a trained ML model. High sensitivity may produce false positives.
- App must remain in the **foreground** (iOS limitation for Pythonista 3).
- Detection works best in reasonable lighting against a light background.
