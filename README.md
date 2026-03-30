# AI Vibe Projects — Personal

A collection of personal AI-powered side projects. Each project lives in its own subdirectory.

## 🌐 Live Portal

> **https://&lt;your-github-username&gt;.github.io/&lt;your-repo-name&gt;/**
>
> The portal links to all project demos. Enable GitHub Pages (Settings → Pages → Source: **GitHub Actions**) to activate.

## Projects

| Project | Platform | Description |
|---------|----------|-------------|
| [🦟 Mosquito Detector Web](./mosquito-detector-web/) | Web (GitHub Pages) | Real-time in-browser mosquito detection via camera + proximity buzz audio |
| [🦟 Mosquito Detector iOS](./mosquito-detector-ios/) | Pythonista 3 (iOS) | Same detector as a Pythonista 3 Python app using AVFoundation + Web Audio |

## Repository Structure

```
.
├── portal/                    # Unified GitHub Pages landing page
│   ├── index.html
│   └── style.css
├── mosquito-detector-web/     # Web app (HTML + JS, deployed to GitHub Pages)
├── mosquito-detector-ios/     # Pythonista 3 iOS app (Python)
├── openspec/                  # OpenSpec change management docs
│   └── changes/
└── .github/
    └── workflows/
        └── deploy-web.yml     # Deploys portal + web app to GitHub Pages
```

## GitHub Pages Deployment

All web assets are deployed automatically on every push to `main`.

```
https://<user>.github.io/<repo>/                          → Portal
https://<user>.github.io/<repo>/mosquito-detector-web/    → Mosquito Detector Web App
```

To enable:
1. Push this repo to GitHub (must be public, or GitHub Pro for private).
2. Go to **Settings → Pages → Source** → select **GitHub Actions**.
3. Push any commit to `main` — the workflow handles the rest.

## Adding a New Project

1. Create a subdirectory: `new-project-name/`
2. Add a `new-project-name/README.md`
3. If it's a web app, add its files there — the workflow will include it automatically
4. Add a card to `portal/index.html`
5. Update this README's Projects table
