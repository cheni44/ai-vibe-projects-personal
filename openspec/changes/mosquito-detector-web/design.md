## Context

The existing Pythonista 3 iOS app works but has high installation friction. A GitHub Pages web app eliminates that barrier entirely: the user visits a URL, grants camera permission, and the app runs. The entire implementation must be static files (HTML + CSS + JS) — no server, no build step required for basic use. All camera, processing, and audio logic runs in the browser using standardised Web APIs available since 2019–2021.

## Goals / Non-Goals

**Goals:**
- Zero-install: fully functional by visiting a single GitHub Pages URL
- Match the iOS app's core feature set: live camera preview, mosquito detection overlay, proximity audio, sensitivity control, front/rear camera toggle
- Deployable via GitHub Actions on every push to `main`
- Works on iOS Safari 14.1+, Android Chrome, and desktop browsers
- Single-file JavaScript (no bundler/build required) for maximum simplicity

**Non-Goals:**
- React/Vue/Angular or any JS framework — plain ES2020 modules only
- Backend, database, or user accounts
- Offline PWA / service worker (nice-to-have for v2)
- Pixel-perfect parity with the iOS app's exact algorithms
- TypeScript (no build step constraint)

## Decisions

### D1 — Camera capture via `getUserMedia` + `<video>` + offscreen `<canvas>`

**Decision**: Stream camera frames via `navigator.mediaDevices.getUserMedia({ video: { facingMode } })` into a hidden `<video>` element. Each animation frame, call `ctx.drawImage(video, ...)` on an offscreen `<canvas>` and read pixels with `ctx.getImageData()`.

**Rationale**: This is the canonical, widely-supported browser pattern for real-time camera processing. No library needed. `requestAnimationFrame` naturally throttles to display refresh rate (~60 fps on desktop, ~30 on mobile) — far more than the ≥10 fps spec requirement.

**Alternatives considered**:
- `ImageCapture` API: Newer, higher quality, but Safari support was spotty until iOS 17 — rejected for broad compatibility.
- WebAssembly OpenCV: Overkill; adds a large binary dependency for heuristics we can do in JS.

---

### D2 — Mosquito detection: Canvas pixel array processing in JS

**Decision**: `getImageData()` returns a flat `Uint8ClampedArray` (RGBA). Convert to grayscale in-place, apply a threshold, then run a simple BFS blob-finder on the downsampled pixel grid (96 × 72 px for speed). Filter blobs by area and aspect ratio (sensitivity-scaled). Apply a two-frame motion filter using centroid distance.

**Rationale**: Exact same algorithm as the Python version, translated to JS. No dependencies. Fast enough at 96 × 72 px — even on low-end mobile CPUs, a single frame processes in < 5 ms.

**Alternatives considered**:
- TensorFlow.js COCO-SSD object detection: Would give real object detection but is ~10 MB download and requires a build step — rejected.
- WebGL compute shader: Much faster but complex to write and debug — deferred to v2.

---

### D3 — Audio: Web Audio API oscillator (no audio file)

**Decision**: Synthesise the mosquito buzz programmatically using an `OscillatorNode` (600 Hz sawtooth wave) modulated by a `GainNode` whose gain is updated each detection cycle to the proximity score. A separate low-frequency `OscillatorNode` (150 Hz) amplitude-modulates the carrier via a second `GainNode` to simulate wing-beat buzz.

**Rationale**: Avoids bundling an audio file. The Web Audio API is supported in all target browsers. Programmatic synthesis is more flexible (volume changes are instantaneous, no audio glitch on loop). Removes asset-management complexity.

**Alternatives considered**:
- `<audio>` element with a `.wav` file: Requires asset hosting; volume changes can glitch on some iOS versions — rejected.
- Prerecorded sample via `AudioBuffer`: Better realism but requires fetching a file — deferred to v2.

---

### D4 — UI: Overlay `<canvas>` stacked on top of `<video>`

**Decision**: Stack a transparent `<canvas>` directly over the `<video>` using CSS `position: absolute`. Draw bounding boxes on the overlay canvas each detection cycle. Keep `<video>` as the live preview (no frame-copy overhead for display).

**Rationale**: Avoids copying pixels back to a display canvas each frame (only the hidden offscreen canvas is read). The `<video>` element handles its own rendering efficiently.

---

### D5 — GitHub Pages deployment via GitHub Actions

**Decision**: Place all web app files in `mosquito-detector-web/` at the repo root. Add a GitHub Actions workflow (`.github/workflows/deploy-web.yml`) that copies `mosquito-detector-web/` to the `gh-pages` branch using `actions/deploy-pages`. Configure GitHub Pages to serve from the `gh-pages` branch.

**Rationale**: Keeps the source files in a clearly named directory rather than the repo root, supports other projects in the monorepo, and automates deployment on every push to `main`.

**Alternatives considered**:
- Serve from `docs/` on `main`: Simpler, but pollutes the root and mixes source with output — rejected.
- Manual push to `gh-pages`: Error-prone, not automated — rejected.

## Risks / Trade-offs

- **[Risk] iOS Safari `getUserMedia` requires HTTPS** → Mitigation: GitHub Pages always serves HTTPS; local dev requires `localhost` (exempt).
- **[Risk] iOS Safari autoplay restrictions block audio until user gesture** → Mitigation: Require an explicit "Start" button tap before creating the AudioContext; this satisfies the user-gesture requirement.
- **[Risk] BFS blob detection is slow for large frames** → Mitigation: Always downsample to 96 × 72 before processing; cap at one detection pass per animation frame.
- **[Risk] Front camera unavailable on desktop** → Mitigation: Fall back gracefully to rear/default; log a console warning.
- **[Risk] GitHub Pages may be disabled on private repos** → Mitigation: Document that the repo must be public (or use GitHub Pro).

## Migration Plan

1. Add `mosquito-detector-web/` directory and `.github/workflows/deploy-web.yml` to the repo.
2. Push to `main`; GitHub Actions deploys to `gh-pages`.
3. In repo Settings → Pages → Source: select `gh-pages` branch / root.
4. Share the `https://<user>.github.io/<repo>/` URL.

Rollback: Revert the workflow commit; delete the `gh-pages` branch.

## Open Questions

- Should the bounding boxes on the overlay canvas be cleared per-frame (flash-free) or accumulated with decay? Per-frame clear is simpler and sufficient for v1.
- Should the sensitivity slider default differ from the iOS version's 0.5? Keep it at 0.5 for parity.
