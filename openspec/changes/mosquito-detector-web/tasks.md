## 1. Project Setup

- [x] 1.1 Create `mosquito-detector-web/` directory with `index.html`, `app.js`, `style.css`, and `README.md` stubs
- [x] 1.2 Write `mosquito-detector-web/README.md` with: project description, live URL placeholder, local dev instructions (`npx serve`), and GitHub Pages setup steps (Settings → Pages → Source: GitHub Actions)
- [x] 1.3 Create `.github/workflows/deploy-web.yml` — GitHub Actions workflow that triggers on push to `main`, uploads `mosquito-detector-web/` as a Pages artifact, and deploys via `actions/deploy-pages`

## 2. HTML Structure (`index.html`)

- [x] 2.1 Write semantic HTML shell: `<meta viewport>`, title "Mosquito Detector", link to `style.css`, defer-load `app.js`
- [x] 2.2 Add the video/overlay stack: `<div class="preview-wrapper">` containing a `<video>` (autoplay, muted, playsinline) and a `<canvas id="overlay">` positioned absolutely on top
- [x] 2.3 Add controls section: "Start" `<button id="startBtn">`, "🔄 Flip Camera" `<button id="flipBtn">` (disabled until stream active)
- [x] 2.4 Add proximity meter: `<p id="proximityText">Proximity: —</p>` and `<div class="prox-bar-bg"><div id="proxBar"></div></div>`
- [x] 2.5 Add sensitivity control: `<label>`, `<input type="range" id="sensitivitySlider" min="0" max="1" step="0.01" value="0.5">`
- [x] 2.6 Add an `<div id="errorMsg" hidden>` for camera error messages

## 3. Styles (`style.css`)

- [x] 3.1 Write base resets and dark-theme body/background (`#1a1a1a` background, white text)
- [x] 3.2 Style `.preview-wrapper` as `position: relative` with 16:9 aspect-ratio; make `video` and `canvas#overlay` fill it with `position: absolute; top:0; left:0; width:100%; height:100%`
- [x] 3.3 Style buttons: rounded corners, white border, dark background, tap-target ≥ 44 px
- [x] 3.4 Style proximity bar: full-width track with a coloured fill div; use CSS custom property `--prox-color` toggled by JS (green/yellow/red)
- [x] 3.5 Add responsive layout: single column on narrow viewports (< 600 px), max-width 700 px centred on wide screens; no horizontal overflow at 320 px width

## 4. Camera Capture (`app.js` — camera module)

- [x] 4.1 Implement `startCamera(facingMode)` — calls `getUserMedia({ video: { facingMode, width: 640, height: 480 } })`, sets `video.srcObject`, returns the stream; displays `#errorMsg` on `NotAllowedError` / `NotFoundError`
- [x] 4.2 Implement `stopCamera(stream)` — calls `track.stop()` on all stream tracks and clears `video.srcObject`
- [x] 4.3 Wire `#startBtn` click: if not running → `startCamera('environment')`, start frame loop, update button to "Stop"; if running → `stopCamera()`, cancel frame loop, update button to "Start"
- [x] 4.4 Wire `#flipBtn` click: stop current stream, toggle `facingMode`, call `startCamera(newFacing)`, reset detector motion state, clear overlay canvas

## 5. Detection Engine (`app.js` — detector module)

- [x] 5.1 Create offscreen `<canvas>` (96 × 72 px) and 2D context; implement `captureFrame()` — draws video frame to offscreen canvas and returns `ImageData`
- [x] 5.2 Implement `toGrayscaleMask(imageData, threshold=80)` — converts RGBA pixel array to a `Uint8Array` boolean mask (1 = foreground) using luminance formula `0.299R + 0.587G + 0.114B`
- [x] 5.3 Implement `findBlobs(mask, width, height)` — BFS connected-component labeling; returns array of `{ cx, cy, bbox: {x,y,w,h}, area, aspectRatio }` objects; skip single-pixel blobs
- [x] 5.4 Implement `filterBlobs(blobs, sensitivity)` — reject blobs outside sensitivity-scaled area range and aspect-ratio bounds (0.15–12.0)
- [x] 5.5 Implement `motionFilter(blobs, prevBlobs, threshold=1.5)` — match each blob to the nearest previous-frame blob within 20 px; return only blobs that have moved ≥ threshold px; store current blobs as `prevBlobs` for next frame
- [x] 5.6 Implement `computeProximity(blobArea, frameArea)` — returns `Math.min(1.0, blobArea / frameArea / 0.02)`
- [x] 5.7 Implement `detect(imageData, sensitivity, prevBlobs)` — orchestrates steps 5.2–5.6; returns `{ detections: [{bbox, proximity}], prevBlobs }`

## 6. Audio Alert (`app.js` — audio module)

- [x] 6.1 Implement `createAudioAlert()` — creates `AudioContext`, sawtooth `OscillatorNode` at 600 Hz, sine `OscillatorNode` at 150 Hz (LFO), three `GainNode`s: LFO gain (fixed 0.5), proximity gain (starts 0), master gain (fixed 0.8); connect graph and start oscillators; return `{ ctx, proximityGain }`
- [x] 6.2 Implement `updateAudio(alert, proximityScore)` — calls `proximityGain.gain.setTargetAtTime(score, ctx.currentTime, 0.05)` for smooth transitions
- [x] 6.3 Implement silence timeout: track `lastDetectionTime`; if `Date.now() - lastDetectionTime > 1000`, call `updateAudio(alert, 0)`; call `updateAudio` with actual score whenever a detection exists
- [x] 6.4 Lazily create `AudioContext` on first "Start" button tap (satisfies browser autoplay policy); `null`-guard all audio calls until created

## 7. Main Animation Loop (`app.js` — main)

- [x] 7.1 Implement `animationLoop()` — calls `captureFrame()`, `detect(...)`, `updateAudio(...)`, `renderOverlay(...)`, then `requestAnimationFrame(animationLoop)`; store `rafId` to allow cancellation
- [x] 7.2 Implement `renderOverlay(detections, scaleX, scaleY)` — clears overlay canvas, draws red bounding boxes scaled from processing (96×72) to display resolution using `canvas.width/PROC_W` scale factors
- [x] 7.3 Implement `updateProximityUI(score)` — updates `#proximityText`, sets `--prox-color` CSS var and `#proxBar` width based on score thresholds (green < 0.4, yellow < 0.7, red ≥ 0.7)
- [x] 7.4 Wire sensitivity slider `input` event to update a module-level `sensitivity` variable consumed by `detect()`

## 8. GitHub Actions Workflow

- [x] 8.1 Write `.github/workflows/deploy-web.yml`: trigger on `push: branches: [main]`; job `deploy` with `permissions: pages: write, id-token: write`; steps: `actions/checkout@v4`, `actions/configure-pages@v5`, `actions/upload-pages-artifact@v3` with `path: mosquito-detector-web`, `actions/deploy-pages@v4`

## 9. Integration & Manual Testing

- [ ] 9.1 Open `mosquito-detector-web/index.html` via `npx serve` on localhost; verify camera preview appears and updates in real time
- [ ] 9.2 Test detection: hold a small dark object against a light background; confirm red bounding box appears
- [ ] 9.3 Test audio: confirm buzz sound starts when bounding box appears and fades out after ~1 s of no detection
- [ ] 9.4 Test sensitivity slider: reduce sensitivity and verify fewer false detections
- [ ] 9.5 Test camera flip: confirm front/rear camera switches without error
- [ ] 9.6 Test permission denied: block camera in browser settings; confirm error message shown
- [ ] 9.7 Push to `main` on GitHub; confirm GitHub Actions deploys and app loads at the Pages URL
- [ ] 9.8 Test on iOS Safari (real device): confirm camera, detection, and audio all function correctly
