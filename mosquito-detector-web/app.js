// app.js — Mosquito Detector Web App
// Pure ES2020, no dependencies. Runs in any modern browser.
//
// Sections:
//   1. Constants & state
//   2. DOM references
//   3. Camera capture
//   4. Detection engine
//   5. Audio alert
//   6. Animation loop & UI
//   7. Event wiring

'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// 1. Constants & state
// ═══════════════════════════════════════════════════════════════════════════

const PROC_W          = 128;        // processing canvas width  (px)
const PROC_H          = 96;         // processing canvas height (px)
const FRAME_AREA      = PROC_W * PROC_H;
const SILENCE_MS      = 1000;       // ms of no detection before audio fades to 0
const STABLE_MS       = 1000;       // ms a blob must persist before being shown/heard
const EVICT_MS        = 500;        // ms since last seen before evicting from tracker
const TRACKER_GRID    = 8;          // centroid quantisation grid size (px, processing res)
const OPTICAL_ZOOM_CAP = 5;         // max optical zoom to apply (prevents digital zoom on Android)
const DIFF_THRESHOLD  = 15;         // (kept for reference, motion filter removed)

// ── Mic / sound-detection constants ──────────────────────────────────────────
const MOSQUITO_HZ_LO  = 300;    // lower bound of mosquito wingbeat band (Hz)
const MOSQUITO_HZ_HI  = 700;    // upper bound
const MIC_FFT_SIZE    = 2048;   // FFT resolution (44100 Hz → ~21.5 Hz/bin)
const MIC_CALIB_MS    = 1500;   // background-noise calibration window (ms)
const MIC_SMOOTH_K    = 0.18;   // EMA coefficient for sound score
const MIC_SNR_TARGET  = 0.10;   // excess energy above baseline that maps to score 1.0

// Mutable app state
let stream            = null;      // MediaStream from getUserMedia
let rafId             = null;      // requestAnimationFrame handle
let running           = false;     // whether the camera loop is active
let facingMode        = 'environment'; // current camera side
let sensitivity       = 0.5;       // detection sensitivity [0, 1]
let audioAlert        = null;      // { ctx, proximityGain } or null
let lastDetectionTime = 0;         // timestamp of last stable detection
let stableTracker     = new Map(); // Map<key, {firstSeenMs, lastSeenMs, blob}>

// Mic state
let micStream         = null;      // MediaStream (audio only)
let micAnalyser       = null;      // AnalyserNode
let micFreqData       = null;      // Uint8Array for getByteFrequencyData
let micBinLo          = 0;         // FFT bin index for MOSQUITO_HZ_LO
let micBinHi          = 0;         // FFT bin index for MOSQUITO_HZ_HI
let micBaseline       = -1;        // average band energy during calibration (-1 = not done)
let micCalibSamples   = [];        // samples accumulated during calibration
let micCalibStart     = 0;
let soundScore        = 0;         // current smoothed sound score [0, 1]

// ═══════════════════════════════════════════════════════════════════════════
// 2. DOM references
// ═══════════════════════════════════════════════════════════════════════════

const video            = document.getElementById('video');
const overlay          = document.getElementById('overlay');
const overlayCtx       = overlay.getContext('2d');
const startBtn         = document.getElementById('startBtn');
const flipBtn          = document.getElementById('flipBtn');
const sensitivitySlider = document.getElementById('sensitivitySlider');
const sensitivityValue = document.getElementById('sensitivityValue');
const proximityText    = document.getElementById('proximityText');
const proxBar          = document.getElementById('proxBar');
const errorMsg         = document.getElementById('errorMsg');
const errorText        = document.getElementById('errorText');
const permSteps        = document.getElementById('permSteps');
const retryBtn         = document.getElementById('retryBtn');
const permBanner       = document.getElementById('permBanner');

// Offscreen canvas for pixel capture at processing resolution
const offscreen = document.createElement('canvas');
offscreen.width  = PROC_W;
offscreen.height = PROC_H;
const offCtx = offscreen.getContext('2d', { willReadFrequently: true });

// ═══════════════════════════════════════════════════════════════════════════
// 3. Camera capture + permission handling
// ═══════════════════════════════════════════════════════════════════════════

/** Browser-specific recovery steps when camera permission is denied. */
const BROWSER_STEPS = {
  'safari-ios': [
    '開啟 iPhone／iPad 的「設定」App',
    '捲動找到「Safari」，點擊進入',
    '點擊「相機」→ 選擇「允許」',
    '回到瀏覽器，點擊下方「重試」按鈕',
  ],
  'safari-mac': [
    '點擊上方選單列「Safari」→「設定」（或「偏好設定」）',
    '選擇「網站」標籤 → 左側點「相機」',
    '找到此網站，將權限改為「允許」',
    '點擊下方「重試」按鈕',
  ],
  'chrome-desktop': [
    '點擊網址列左側的 🔒 或 📷 圖示',
    '找到「相機」→ 將選項改為「允許」',
    '頁面會自動重新整理，再按「Start」即可',
  ],
  'chrome-android': [
    '點擊網址列右側的 ⋮ 選單 → 「網站設定」',
    '點擊「相機」→ 選擇「允許」',
    '點擊下方「重試」按鈕',
  ],
  'firefox': [
    '點擊網址列左側的相機 🎥 或 🔒 圖示',
    '在相機欄位選擇「允許」',
    '點擊下方「重試」按鈕',
  ],
  'edge': [
    '點擊網址列左側的 🔒 或 📷 圖示',
    '找到「相機」→ 將選項改為「允許」',
    '頁面會自動重新整理，再按「Start」即可',
  ],
  'generic': [
    '在瀏覽器網址列附近找到相機或鎖頭圖示',
    '將相機權限改為「允許」',
    '點擊下方「重試」按鈕',
  ],
};

/** Detect the current browser to show the right recovery steps. */
function detectBrowser() {
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua) && /WebKit/.test(ua)) return 'safari-ios';
  if (/Macintosh/.test(ua) && /Safari/.test(ua) && !/Chrome/.test(ua)) return 'safari-mac';
  if (/Firefox/.test(ua)) return 'firefox';
  if (/Edg\//.test(ua)) return 'edge';
  if (/Chrome/.test(ua) && /Android/.test(ua)) return 'chrome-android';
  if (/Chrome/.test(ua)) return 'chrome-desktop';
  return 'generic';
}

/** Query the current camera permission state without triggering a prompt. */
async function checkPermissionState() {
  if (!navigator.permissions) return 'unknown';
  try {
    const result = await navigator.permissions.query({ name: 'camera' });
    return result.state; // 'granted' | 'denied' | 'prompt'
  } catch {
    return 'unknown';
  }
}

/**
 * Start the camera stream with the given facingMode.
 * Shows a pre-permission banner while the browser dialog is pending.
 * On denial, shows browser-specific recovery steps + retry button.
 * Returns the MediaStream, or null on error.
 */
async function startCamera(facing) {
  hideError();

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    showError('此瀏覽器不支援相機功能，請改用 Chrome、Safari 14.1+、Firefox 或 Edge。');
    return null;
  }

  // If permission is already denied, skip getUserMedia and show guide immediately
  const permState = await checkPermissionState();
  if (permState === 'denied') {
    showPermissionDeniedGuide();
    return null;
  }

  // Show the pre-permission banner while the browser dialog is open
  if (permState !== 'granted') showPermBanner();

  try {
    const s = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: facing },
        width:  { ideal: 640 },
        height: { ideal: 480 },
      },
    });
    hidePermBanner();
    video.srcObject = s;
    await video.play();
    applyMaxZoom(s);
    resizeOverlay();
    return s;

  } catch (err) {
    hidePermBanner();

    if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
      showPermissionDeniedGuide();
    } else if (err.name === 'OverconstrainedError') {
      // Retry with minimal constraints as fallback
      return startCameraFallback(facing);
    } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
      showError('📷 找不到相機，請確認裝置上有相機且未被停用。', true);
    } else if (err.name === 'NotReadableError') {
      showError('⚠️ 相機正被其他程式使用，請關閉後點「重試」。', true);
    } else {
      showError(`相機錯誤：${err.message}`, true);
    }
    return null;
  }
}

/** Fallback: retry getUserMedia with minimal video constraints. */
async function startCameraFallback(facing) {
  try {
    const s = await navigator.mediaDevices.getUserMedia({ video: true });
    video.srcObject = s;
    await video.play();
    applyMaxZoom(s);
    resizeOverlay();
    return s;
  } catch (err) {
    showError(`相機錯誤（備用模式）：${err.message}`, true);
    return null;
  }
}

/**
 * Stop all tracks of a MediaStream and clear the video element.
 */
function stopCamera(s) {
  if (s) s.getTracks().forEach(t => t.stop());
  video.srcObject = null;
}

/**
 * Apply the maximum supported zoom level to the first video track of a stream.
 * Fire-and-forget: errors are swallowed so camera startup is never blocked.
 * No-ops silently if the browser or device does not support zoom.
 */
function applyMaxZoom(stream) {
  const track = stream.getVideoTracks()[0];
  if (!track || typeof track.getCapabilities !== 'function') return;
  const capabilities = track.getCapabilities();
  if (capabilities.zoom?.max) {
    const zoomLevel = Math.min(capabilities.zoom.max, OPTICAL_ZOOM_CAP);
    track.applyConstraints({ advanced: [{ zoom: zoomLevel }] }).catch(() => {});
  }
}

/**
 * Synchronise the overlay canvas pixel dimensions with the video element's
 * rendered size so bounding boxes align correctly with the preview.
 */
function resizeOverlay() {
  const rect = video.getBoundingClientRect();
  const w = rect.width  || video.videoWidth  || 640;
  const h = rect.height || video.videoHeight || 480;
  if (overlay.width !== w || overlay.height !== h) {
    overlay.width  = w;
    overlay.height = h;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. Detection engine
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Draw the current video frame onto the offscreen canvas and return ImageData.
 * Returns null if the video is not ready.
 */
function captureFrame() {
  if (video.readyState < 2) return null;
  offCtx.drawImage(video, 0, 0, PROC_W, PROC_H);
  return offCtx.getImageData(0, 0, PROC_W, PROC_H);
}

/**
 * Compute Otsu's optimal threshold from a Float32Array of grayscale values [0,255].
 * Returns a value clamped to [30, 150] to prevent degenerate all-fore/background masks.
 */
function otsuThreshold(grayArray) {
  const hist = new Float64Array(256);
  for (let i = 0; i < grayArray.length; i++) hist[grayArray[i] | 0]++;
  const total = grayArray.length;

  let sumAll = 0;
  for (let t = 0; t < 256; t++) sumAll += t * hist[t];

  let sumB = 0, wB = 0, best = 0, bestT = 80;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sumAll - sumB) / wF;
    const variance = wB * wF * (mB - mF) ** 2;
    if (variance > best) { best = variance; bestT = t; }
  }
  return Math.max(30, Math.min(150, bestT));
}

/**
 * Convert RGBA ImageData to a grayscale Float32Array and a Uint8Array boolean mask.
 * Uses luminance formula: L = 0.299R + 0.587G + 0.114B
 * Threshold is determined per-frame via Otsu's algorithm.
 * Returns { mask, grayArray }.
 */
function toGrayscaleMask(imageData) {
  const { data } = imageData;
  const n        = PROC_W * PROC_H;
  const grayArray = new Float32Array(n);

  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    grayArray[p] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }

  const threshold = otsuThreshold(grayArray);
  const mask = new Uint8Array(n);
  for (let p = 0; p < n; p++) mask[p] = grayArray[p] < threshold ? 1 : 0;

  return { mask, grayArray };
}

/**
 * BFS connected-component labeling on a boolean mask.
 * Returns an array of blob objects: { cx, cy, bbox: {x,y,w,h}, area, aspectRatio }
 * Blobs with area < 2 px are skipped.
 */
function findBlobs(mask, width, height) {
  const visited = new Uint8Array(width * height);
  const blobs   = [];

  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || visited[start]) continue;

    // BFS from this seed pixel
    const queue  = [start];
    visited[start] = 1;

    let minX = width, maxX = 0;
    let minY = height, maxY = 0;
    let area = 0;

    let head = 0;
    while (head < queue.length) {
      const idx = queue[head++];
      const x   = idx % width;
      const y   = (idx / width) | 0;

      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      area++;

      // 4-connected neighbours
      if (x > 0          && mask[idx - 1]     && !visited[idx - 1])     { visited[idx - 1]     = 1; queue.push(idx - 1);     }
      if (x < width - 1  && mask[idx + 1]     && !visited[idx + 1])     { visited[idx + 1]     = 1; queue.push(idx + 1);     }
      if (y > 0          && mask[idx - width] && !visited[idx - width]) { visited[idx - width] = 1; queue.push(idx - width); }
      if (y < height - 1 && mask[idx + width] && !visited[idx + width]) { visited[idx + width] = 1; queue.push(idx + width); }
    }

    if (area < 2) continue;

    const bw = maxX - minX + 1;
    const bh = maxY - minY + 1;

    blobs.push({
      cx:          (minX + maxX) / 2,
      cy:          (minY + maxY) / 2,
      bbox:        { x: minX, y: minY, w: bw, h: bh },
      area,
      aspectRatio: bh > 0 ? bw / bh : 0,
    });
  }

  return blobs;
}

/**
 * Remove blobs that don't match the size / aspect-ratio criteria.
 * sensitivity (0–1) scales the minimum area threshold.
 */
function filterBlobs(blobs, sens) {
  // Larger minimums so only genuine mosquito-sized dark spots pass.
  // At sens=0.5: areaMin ≈ 30; at sens=1.0: areaMin ≈ 10; at sens=0.0: areaMin ≈ 50
  const areaMin = Math.max(6, Math.round(40 * (1.5 - sens)));
  const areaMax = Math.round(400 * (0.5 + sens));
  const AR_MIN  = 0.2;
  const AR_MAX  = 7.0;

  return blobs.filter(b =>
    b.area >= areaMin &&
    b.area <= areaMax &&
    b.aspectRatio >= AR_MIN &&
    b.aspectRatio <= AR_MAX
  );
}

/**
 * Pixel-level absolute frame difference mask.
 * Returns a Uint8Array where |currentGray[i] - prevGray[i]| >= DIFF_THRESHOLD is 1, else 0.
 */
function frameDiffMask(currentGray, prevGray) {
  const n    = currentGray.length;
  const diff = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    diff[i] = Math.abs(currentGray[i] - prevGray[i]) >= DIFF_THRESHOLD ? 1 : 0;
  }
  return diff;
}

/**
 * Proximity score: fraction of frame area occupied by the blob,
 * normalised so 2 % occupancy → 1.0.
 */
function computeProximity(blobArea, frameArea) {
  return Math.min(1.0, blobArea / frameArea / 0.02);
}

/**
 * Full detection pipeline for one frame.
 * Detects static dark blobs via Otsu adaptive threshold — no motion required.
 * Returns { detections: [{cx, cy, bbox, proximity}] }
 */
function detect(imageData, sens) {
  const { mask } = toGrayscaleMask(imageData);

  let blobs = findBlobs(mask, PROC_W, PROC_H);
  blobs     = filterBlobs(blobs, sens);
  blobs.sort((a, b) => b.area - a.area);

  const detections = blobs.map(b => ({
    cx:        b.cx,
    cy:        b.cy,
    bbox:      b.bbox,
    proximity: computeProximity(b.area, FRAME_AREA),
  }));

  return { detections };
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. Stable detection tracker
// ═══════════════════════════════════════════════════════════════════════════

/** Grid-quantised identity key for a detection blob. */
function trackerKey(det) {
  return `${Math.round(det.cx / TRACKER_GRID)},${Math.round(det.cy / TRACKER_GRID)}`;
}

/**
 * Upsert each detected blob in stableTracker, then evict stale entries.
 * An entry is evicted when it has not been seen for more than EVICT_MS.
 */
function updateTracker(detectedBlobs) {
  const now = Date.now();
  for (const blob of detectedBlobs) {
    const key = trackerKey(blob);
    if (stableTracker.has(key)) {
      const entry = stableTracker.get(key);
      entry.lastSeenMs = now;
      entry.blob       = blob;
    } else {
      stableTracker.set(key, { firstSeenMs: now, lastSeenMs: now, blob });
    }
  }
  // Evict entries not seen recently
  for (const [key, entry] of stableTracker) {
    if (now - entry.lastSeenMs > EVICT_MS) stableTracker.delete(key);
  }
}

/**
 * Returns tracker entries that have been continuously present for >= STABLE_MS,
 * sorted by blob proximity descending.
 */
function getStableDetections() {
  const now    = Date.now();
  const stable = [];
  for (const entry of stableTracker.values()) {
    if (now - entry.firstSeenMs >= STABLE_MS) stable.push(entry);
  }
  stable.sort((a, b) => b.blob.proximity - a.blob.proximity);
  return stable;
}

// ═══════════════════════════════════════════════════════════════════════════
// 6. Audio alert (Web Audio API)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Build the synthesised buzz audio graph.
 * Must be called inside a user-gesture handler (browser autoplay policy).
 *
 * Signal graph:
 *   carrier (600 Hz saw) ──► proximityGain ──► masterGain ──► destination
 *   lfo     (150 Hz sin) ──► lfoGain ──► proximityGain.gain  (AM modulation)
 *
 * Returns { ctx, proximityGain }
 */
function createAudioAlert() {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();

  // Carrier: 600 Hz sawtooth wave (buzzy timbre)
  const carrier = ctx.createOscillator();
  carrier.type           = 'sawtooth';
  carrier.frequency.value = 600;

  // LFO: 150 Hz sine — simulates wing-beat amplitude modulation
  const lfo = ctx.createOscillator();
  lfo.type           = 'sine';
  lfo.frequency.value = 150;

  // LFO depth gain (fixed — controls how strongly the LFO modulates the carrier)
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 0.5;

  // Proximity gain: updated each frame, starts silent
  const proximityGain = ctx.createGain();
  proximityGain.gain.value = 0;

  // Master output gain
  const masterGain = ctx.createGain();
  masterGain.gain.value = 0.8;

  // Connect
  carrier.connect(proximityGain);
  proximityGain.connect(masterGain);
  masterGain.connect(ctx.destination);
  lfo.connect(lfoGain);
  lfoGain.connect(proximityGain.gain);   // LFO modulates the proximity gain value

  carrier.start();
  lfo.start();

  return { ctx, proximityGain };
}

/**
 * Smoothly set the proximity gain to `score` using a 50 ms time constant.
 */
function updateAudio(alert, score) {
  if (!alert) return;
  const { ctx, proximityGain } = alert;
  proximityGain.gain.setTargetAtTime(
    Math.max(0, score),
    ctx.currentTime,
    0.05   // ~50 ms time constant → smooth, no clicks
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// 6b. Microphone sound-detection module
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Request microphone access and set up the FFT analyser.
 * Calibrates background noise for MIC_CALIB_MS ms before scoring begins.
 */
async function initMicListener() {
  try {
    micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    const actx = new (window.AudioContext || window.webkitAudioContext)();
    const src  = actx.createMediaStreamSource(micStream);
    micAnalyser = actx.createAnalyser();
    micAnalyser.fftSize = MIC_FFT_SIZE;
    micAnalyser.smoothingTimeConstant = 0.75;
    src.connect(micAnalyser);
    micFreqData = new Uint8Array(micAnalyser.frequencyBinCount);
    // Map Hz to FFT bin indices
    const binHz = actx.sampleRate / MIC_FFT_SIZE;
    micBinLo    = Math.max(0, Math.round(MOSQUITO_HZ_LO / binHz));
    micBinHi    = Math.min(micAnalyser.frequencyBinCount - 1, Math.round(MOSQUITO_HZ_HI / binHz));
    // Begin calibration
    micCalibSamples = [];
    micCalibStart   = Date.now();
    micBaseline     = -1;
    soundScore      = 0;
  } catch (e) {
    console.warn('Mic init failed (continuing without sound detection):', e);
    micAnalyser = null;
  }
}

/**
 * Read current mic FFT, return a normalised [0, 1] mosquito-sound score.
 * Returns 0 while calibrating or if mic is unavailable.
 */
function readMicScore() {
  if (!micAnalyser || !micFreqData) return 0;
  micAnalyser.getByteFrequencyData(micFreqData);

  // Average energy in the mosquito wingbeat band
  const count = micBinHi - micBinLo + 1;
  let energy  = 0;
  for (let i = micBinLo; i <= micBinHi; i++) energy += micFreqData[i] / 255;
  energy /= count;

  const now = Date.now();
  if (micBaseline < 0) {
    // Still collecting calibration samples
    micCalibSamples.push(energy);
    if (now - micCalibStart >= MIC_CALIB_MS && micCalibSamples.length > 0) {
      const avg = micCalibSamples.reduce((s, v) => s + v, 0) / micCalibSamples.length;
      micBaseline = avg * 1.25;  // 25 % headroom above ambient
    }
    return 0;
  }

  // Excess energy above baseline, normalised
  const excess = Math.max(0, energy - micBaseline);
  const raw    = Math.min(1, excess / MIC_SNR_TARGET);
  soundScore   = soundScore * (1 - MIC_SMOOTH_K) + raw * MIC_SMOOTH_K;
  return soundScore;
}

/** Stop mic and reset all mic state. */
function stopMicListener() {
  if (micStream) { micStream.getTracks().forEach(t => t.stop()); micStream = null; }
  micAnalyser     = null;
  micFreqData     = null;
  micBaseline     = -1;
  micCalibSamples = [];
  soundScore      = 0;
}

/**
 * Update sound indicator text + bar from a [0, 1] score.
 * Shows calibration status, distance label, and colour-coded bar.
 */
function updateSoundUI(score) {
  const soundText = document.getElementById('soundText');
  const soundBar  = document.getElementById('soundBar');
  if (!soundText || !soundBar) return;

  const pct = Math.round(score * 100);
  soundBar.style.width = `${pct}%`;

  const color = score < 0.4 ? '#44dd77'
              : score < 0.7 ? '#ffcc00'
              :               '#ff4444';
  document.documentElement.style.setProperty('--sound-color', color);

  if (!micAnalyser) {
    soundText.textContent = '🎙 聲音偵測：未啟用';
  } else if (micBaseline < 0) {
    soundText.textContent = '🎙 聲音偵測：環境校準中…';
  } else if (score < 0.08) {
    soundText.textContent = '🔇 聲音偵測：靜音';
  } else if (score < 0.4) {
    soundText.textContent = '🔉 聲音偵測：偵測到蚊子 — 遠';
  } else if (score < 0.7) {
    soundText.textContent = '🔊 聲音偵測：偵測到蚊子 — 中距離';
  } else {
    soundText.textContent = '🔊 聲音偵測：蚊子很近！';
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 7. Animation loop & UI rendering
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Main per-frame loop.
 * Captures a frame, runs detection, updates stable tracker, then updates audio and UI.
 */
function animationLoop() {
  const imageData = captureFrame();

  if (imageData) {
    const result = detect(imageData, sensitivity);

    // Update stable tracker with this frame's detections
    updateTracker(result.detections);
    const stableDetections = getStableDetections();

    const topScore = stableDetections.length > 0 ? stableDetections[0].blob.proximity : 0;

    // ── Synthesised buzz removed (too noisy) ───────────────────────────────

    // ── Visuals ────────────────────────────────────────────────────────────
    renderOverlay(stableDetections);
    updateProximityUI(stableDetections.length > 0 ? topScore : 0);
  }

  // ── Mic sound detection (independent of visual) ────────────────────────
  updateSoundUI(readMicScore());

  rafId = requestAnimationFrame(animationLoop);
}

/**
 * Clear the overlay canvas and draw a red circle for each stable detection,
 * scaling from processing resolution (PROC_W × PROC_H) to display size.
 */
function renderOverlay(stableEntries) {
  const w = overlay.width;
  const h = overlay.height;
  overlayCtx.clearRect(0, 0, w, h);
  if (!stableEntries.length) return;

  const scaleX = w / PROC_W;
  const scaleY = h / PROC_H;

  overlayCtx.strokeStyle = 'rgba(255, 40, 40, 0.9)';
  overlayCtx.lineWidth   = 3;

  for (const entry of stableEntries) {
    const { cx, cy, bbox } = entry.blob;
    const radius = Math.max(bbox.w, bbox.h) / 2 * 1.3 * Math.max(scaleX, scaleY);
    overlayCtx.beginPath();
    overlayCtx.arc(cx * scaleX, cy * scaleY, radius, 0, Math.PI * 2);
    overlayCtx.stroke();
  }
}

/**
 * Update the proximity text label and progress bar.
 * score = 0 when nothing is detected.
 */
function updateProximityUI(score) {
  if (score > 0) {
    const pct   = Math.round(score * 100);
    const color = score < 0.4 ? '#44dd77'
                : score < 0.7 ? '#ffcc00'
                :               '#ff4444';

    proximityText.textContent = `👁 視覺距離：${pct} %`;
    document.documentElement.style.setProperty('--prox-color', color);
    proxBar.style.width = `${pct}%`;
  } else {
    proximityText.textContent = '👁 視覺距離：未偵測';
    proxBar.style.width = '0%';
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 7. Event wiring
// ═══════════════════════════════════════════════════════════════════════════

// ── Start / Stop ──────────────────────────────────────────────────────────
startBtn.addEventListener('click', async () => {
  if (!running) {
    stream = await startCamera(facingMode);
    if (!stream) return;   // startCamera already showed the error

    await initMicListener();

    lastDetectionTime = 0;
    running           = true;
    startBtn.textContent = '⏹ Stop';
    flipBtn.disabled     = false;
    rafId = requestAnimationFrame(animationLoop);
  } else {
    cancelAnimationFrame(rafId);
    rafId = null;
    stopCamera(stream);
    stream  = null;
    running = false;
    stopMicListener();
    updateProximityUI(0);
    updateSoundUI(0);
    stableTracker.clear();
    overlayCtx.clearRect(0, 0, overlay.width, overlay.height);
    startBtn.textContent = '▶ Start';
    flipBtn.disabled     = true;
  }
});

// ── Flip Camera ───────────────────────────────────────────────────────────
flipBtn.addEventListener('click', async () => {
  if (!running) return;

  cancelAnimationFrame(rafId);
  rafId = null;
  stopCamera(stream);
  stream = null;
  stopMicListener();

  facingMode    = facingMode === 'environment' ? 'user' : 'environment';
  stableTracker.clear();
  overlayCtx.clearRect(0, 0, overlay.width, overlay.height);

  stream = await startCamera(facingMode);
  if (stream) {
    await initMicListener();
    rafId = requestAnimationFrame(animationLoop);
  } else {
    // Camera switch failed — reset to stopped state
    running              = false;
    startBtn.textContent = '▶ Start';
    flipBtn.disabled     = true;
  }
});

// ── Retry button (inside error box) ──────────────────────────────────────
retryBtn.addEventListener('click', async () => {
  hideError();
  stream = await startCamera(facingMode);
  if (stream) {
    await initMicListener();
    lastDetectionTime = 0;
    running           = true;
    startBtn.textContent = '⏹ Stop';
    flipBtn.disabled     = false;
    rafId = requestAnimationFrame(animationLoop);
  }
});

// ── Sensitivity slider ────────────────────────────────────────────────────
sensitivitySlider.addEventListener('input', () => {
  sensitivity = parseFloat(sensitivitySlider.value);
  sensitivityValue.textContent = `${Math.round(sensitivity * 100)}%`;
});

// ── Resize overlay on window resize ──────────────────────────────────────
window.addEventListener('resize', () => {
  if (running) resizeOverlay();
});

// ── Error / banner helpers ────────────────────────────────────────────────

/** Show a plain error message, with optional retry button. */
function showError(msg, withRetry = false) {
  errorText.textContent = msg;
  permSteps.hidden      = true;
  permSteps.innerHTML   = '';
  retryBtn.hidden       = !withRetry;
  errorMsg.hidden       = false;
}

/** Show browser-specific permission-denied guide with numbered steps + retry. */
function showPermissionDeniedGuide() {
  const browser = detectBrowser();
  const steps   = BROWSER_STEPS[browser] || BROWSER_STEPS['generic'];

  errorText.textContent = '🔒 相機權限被拒絕，請依照以下步驟開啟：';
  permSteps.innerHTML   = steps.map(s => `<li>${s}</li>`).join('');
  permSteps.hidden      = false;
  retryBtn.hidden       = false;
  errorMsg.hidden       = false;
}

function hideError() {
  errorMsg.hidden     = true;
  errorText.textContent = '';
  permSteps.hidden    = true;
  permSteps.innerHTML = '';
  retryBtn.hidden     = true;
}

function showPermBanner() { permBanner.hidden = false; }
function hidePermBanner() { permBanner.hidden = true; }
