# AI Vibe Projects — Personal

A collection of personal AI-powered side projects. Each project lives in its own subdirectory.

## 🌐 Live Portal

> **https://&lt;your-github-username&gt;.github.io/&lt;your-repo-name&gt;/**
>
> The portal links to all project demos. Enable GitHub Pages (Settings → Pages → Source: **GitHub Actions**) to activate.

## Projects

| Project | Platform | Description |
|---------|----------|-------------|
| [🦟 Mosquito Detector Web](./mosquito-detector-web/) | Web (GitHub Pages) | Real-time in-browser mosquito detection via camera (dark blob) + mic FFT sound detection |
| [🦟 Mosquito Detector iOS](./mosquito-detector-ios/) | Pythonista 3 (iOS) | Same detector as a Pythonista 3 Python app using AVFoundation + Web Audio |
| [🌧 暴雨開車](./rainy-drive/) | Web (GitHub Pages) | First-person highway driving game — dodge traffic in a torrential downpour. Lane-change controls, 5 scenic zones, daytime POV with branded NPC vehicles |

## Repository Structure

```
.
├── portal/                    # Unified GitHub Pages landing page
│   ├── index.html
│   └── style.css
├── mosquito-detector-web/     # Web app (HTML + JS, deployed to GitHub Pages)
├── mosquito-detector-ios/     # Pythonista 3 iOS app (Python)
├── rainy-drive/               # 暴雨開車 driving game (HTML5 Canvas + Web Audio)
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

---

## 開發歷程 — OpenSpec Workflow

本專案使用 [OpenSpec](https://openspec.dev) 管理每一次功能變更，每個 change 都遵循 **propose → apply** 兩步驟：

- **`/openspec-propose`**：描述需求，自動生成 `proposal.md`、`design.md`、`specs/`、`tasks.md` 四份文件
- **`/openspec-apply`**：依照 `tasks.md` 逐一實作，完成後 commit & push

所有 change artifacts 存放於 `openspec/changes/<change-name>/`。

---

### Change 1 — `mosquito-detector-ios`
**時機：** 專案初始，建立 iOS 版本

| | |
|--|--|
| **Propose 動機** | 想在 Pythonista 3 上使用手機相機偵測蚊子，以接近距離調整音量提示 |
| **Apply 產出** | `camera.py`（AVFoundation）、`detector.py`（PIL+numpy BFS）、`audio_alert.py`（sound.Player）、`ui_view.py`、`main.py`、`test_detector.py`（16 個單元測試全通過）、`assets/buzz.wav` |
| **Commit** | `7e63a54` Initial commit |

---

### Change 2 — `mosquito-detector-web`
**時機：** iOS 版安裝門檻高，改為 Zero-install 網頁版

| | |
|--|--|
| **Propose 動機** | 讓任何人打開網址即可使用，無需安裝任何 App |
| **Apply 產出** | `index.html`、`app.js`（getUserMedia + Canvas BFS + Web Audio API 合成音）、`style.css`、`.github/workflows/deploy-web.yml`（GitHub Pages CI/CD）|
| **Commit** | `7e63a54` Initial commit |

---

### Change 3 — `stable-detection-circle`
**時機：** 偵測到雜訊瞬間觸發，誤報太多

| | |
|--|--|
| **Propose 動機** | 需要連續偵測 1 秒才顯示圓圈、才發出聲音，減少單幀雜訊誤報 |
| **Apply 產出** | 新增 `stableTracker`（Map）、`updateTracker()`、`getStableDetections()`；`renderOverlay()` 改畫紅色圓圈（arc）；音效閘控改為 `stableDetections.length > 0` |
| **Commit** | `fbfad42` feat: stable detection circle |

---

### Change 4 — `max-optical-zoom`
**時機：** 蚊子太小，想讓相機自動拉近

| | |
|--|--|
| **Propose 動機** | 啟動相機後自動套用裝置最大光學倍率，提升畫面清晰度與偵測準確率 |
| **Apply 產出** | 新增 `applyMaxZoom(stream)`，呼叫 `track.getCapabilities().zoom.max` 並 `applyConstraints`；fire-and-forget 不阻塞啟動；在 `startCamera()` 與 `startCameraFallback()` 均套用 |
| **Commit** | `5a44171` feat: auto-apply maximum camera zoom |

---

### Change 5 — `improve-detection`
**時機：** Android 數位 zoom 模糊；固定亮度閾值在不同光線下誤報嚴重

| | |
|--|--|
| **Propose 動機** | 1. zoom 只取光學最大（iPhone 17 = 2×）；2. 偵測機制改用自適應閾值 + 像素差分，減少靜止物體誤報 |
| **Apply 產出** | `OPTICAL_ZOOM_CAP = 5`（防 Android 數位 zoom）；`otsuThreshold()`（每幀 Otsu 自適應閾值，鉗制 30–150）；`frameDiffMask()`（像素絕對差 ≥ 15 才視為動態）；處理解析度 96×72 → 128×96 px；aspect ratio filter 縮窄 0.15–12 → 0.2–7 |
| **Commit** | `9214079` feat: improve detection accuracy |
