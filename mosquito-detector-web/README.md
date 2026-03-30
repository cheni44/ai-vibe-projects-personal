# Mosquito Detector — Web App

Real-time mosquito detection in your browser. Visit the page, tap **Start**, point your camera, and hear the buzzing get louder as mosquitoes get closer — no app install required.

## 🌐 Live Demo

> **https://&lt;your-github-username&gt;.github.io/&lt;your-repo-name&gt;/mosquito-detector-web/**
>
> This app is served from the `/mosquito-detector-web/` sub-path of the GitHub Pages site.
> The portal landing page lives at the root: `https://<user>.github.io/<repo>/`
>
> See the [root README](../README.md) for GitHub Pages setup instructions.

## Features

- 📷 Live camera preview with real-time bounding-box overlay
- 🦟 On-device mosquito detection (heuristic blob analysis, no server)
- 🔊 Proximity-scaled audio alert — synthesised buzz, no audio file needed
- 🎚️ Adjustable sensitivity slider
- 🔄 Front / rear camera toggle
- 📱 Responsive — works on phones, tablets, and desktops

## Browser Support

| Browser | Min Version |
|---------|------------|
| Chrome / Edge | 74+ |
| Safari (iOS & macOS) | 14.1+ |
| Firefox | 68+ |

> **HTTPS required** for camera access. GitHub Pages always serves HTTPS. For local dev, use `localhost` (exempt from the HTTPS requirement).

## Local Development

No build step needed — open the HTML directly:

```bash
# Option A: serve with Node (recommended for camera access)
npx serve mosquito-detector-web

# Option B: open directly in browser
open mosquito-detector-web/index.html
```

Then visit **http://localhost:3000** (or the port shown by `serve`).

## Deployment

Deployment is handled by the monorepo's shared workflow at `.github/workflows/deploy-web.yml`.
See the [root README](../README.md#github-pages-deployment) for setup instructions.

This app is served at the `/mosquito-detector-web/` sub-path:
```
https://<user>.github.io/<repo>/mosquito-detector-web/
```

## File Structure

```
mosquito-detector-web/
├── index.html    # Single-page app shell
├── app.js        # Camera, detection, audio, and UI logic
├── style.css     # Responsive dark-theme styles
└── README.md     # This file
```

## How It Works

1. Camera frames are captured at native refresh rate via `getUserMedia` → `<video>` → offscreen `<canvas>` (96 × 72 px).
2. Each frame is converted to a grayscale binary mask (dark pixels = candidates).
3. A BFS flood-fill finds connected blobs; size, aspect-ratio, and motion filters reduce false positives.
4. Proximity = `blob area / frame area / 0.02` (clamped to 1.0).
5. Audio is synthesised via Web Audio API (600 Hz sawtooth + 150 Hz AM modulation); volume = proximity score.
