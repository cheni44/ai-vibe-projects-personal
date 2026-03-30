## Why

The existing Pythonista 3 iOS app requires users to install a paid third-party app and manually copy files to their device, creating high friction. Converting the mosquito detector to a GitHub Pages web app lets anyone visit a single URL, click once, and immediately start detecting mosquitoes in their browser — no installation required, cross-platform, and free to host.

## What Changes

- Introduce a new static web app (HTML + vanilla JavaScript) that replicates all capabilities of the Pythonista 3 version using browser-native APIs
- Replace AVFoundation camera capture with the **WebRTC `getUserMedia` API**
- Replace PIL image processing with **Canvas 2D API** (grayscale, threshold, blob detection)
- Replace Pythonista `sound.Player` with the **Web Audio API** (synthesised buzz oscillator, no audio file required)
- Replace Pythonista `ui` module with a **responsive HTML/CSS UI** (live preview, overlay canvas, controls)
- Add a **GitHub Pages deployment configuration** (`docs/` folder or root `index.html` + GitHub Actions workflow) so the app is publicly accessible at a `github.io` URL
- The Pythonista 3 project remains untouched; this is an additive new deliverable

## Capabilities

### New Capabilities

- `web-camera-capture`: Continuous camera frame capture in the browser using `getUserMedia` and a `<video>` element, exposing frames via a `requestAnimationFrame` draw loop onto an offscreen `<canvas>`
- `web-mosquito-detection`: Per-frame mosquito detection in JavaScript using Canvas pixel data: grayscale conversion, threshold, connected-component blob detection, size/aspect-ratio filter, and inter-frame motion filter
- `web-audio-alert`: Proximity-scaled audio alert using the Web Audio API — a programmatically synthesised mosquito-buzz oscillator (no audio file needed) whose gain scales with the detected proximity score
- `web-detection-ui`: Responsive single-page HTML/CSS/JS UI with live camera preview, bounding-box overlay canvas, proximity meter, sensitivity slider, front/rear camera toggle, and a one-click start button
- `github-pages-deploy`: Static site configuration and GitHub Actions workflow that automatically deploys the web app to GitHub Pages on every push to `main`

### Modified Capabilities

## Impact

- **New files**: `mosquito-detector-web/index.html`, `mosquito-detector-web/app.js`, `mosquito-detector-web/style.css`, `.github/workflows/deploy-web.yml`
- **No changes** to the existing `mosquito-detector-ios/` Pythonista project
- **Dependencies**: Zero runtime dependencies — pure HTML5/CSS3/ES2020 using only browser built-ins (`getUserMedia`, Canvas 2D, Web Audio API)
- **Hosting**: GitHub Pages (free); requires a public GitHub repository
- **Browser support**: Chrome 74+, Safari 14.1+, Firefox 68+, Edge 79+ (all support required APIs)
- **Permissions**: Browser will prompt for camera access; microphone not needed
