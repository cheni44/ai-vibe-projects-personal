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

const PROC_W       = 96;           // processing canvas width  (px)
const PROC_H       = 72;           // processing canvas height (px)
const FRAME_AREA   = PROC_W * PROC_H;
const SILENCE_MS   = 1000;         // ms of no detection before audio fades to 0

// Mutable app state
let stream            = null;      // MediaStream from getUserMedia
let rafId             = null;      // requestAnimationFrame handle
let running           = false;     // whether the camera loop is active
let facingMode        = 'environment'; // current camera side
let sensitivity       = 0.5;       // detection sensitivity [0, 1]
let prevBlobs         = [];        // blobs from the previous frame (motion filter)
let audioAlert        = null;      // { ctx, proximityGain } or null
let lastDetectionTime = 0;         // timestamp of last positive detection

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

// Offscreen canvas for pixel capture at processing resolution
const offscreen = document.createElement('canvas');
offscreen.width  = PROC_W;
offscreen.height = PROC_H;
const offCtx = offscreen.getContext('2d', { willReadFrequently: true });

// ═══════════════════════════════════════════════════════════════════════════
// 3. Camera capture
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Start the camera stream with the given facingMode.
 * Returns the MediaStream, or null on error (error displayed to user).
 */
async function startCamera(facing) {
  hideError();

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    showError('Your browser does not support camera access. Please use Chrome, Safari 14.1+, Firefox, or Edge.');
    return null;
  }

  try {
    const s = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: facing },
        width:  { ideal: 640 },
        height: { ideal: 480 },
      },
    });
    video.srcObject = s;
    await video.play();
    resizeOverlay();
    return s;
  } catch (err) {
    let msg;
    if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
      msg = '🔒 Camera access denied. Please allow camera access in your browser settings, then reload the page.';
    } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
      msg = '📷 No camera found. Please connect a camera and try again.';
    } else if (err.name === 'NotReadableError') {
      msg = '⚠️ Camera is already in use by another application. Close it and try again.';
    } else {
      msg = `Camera error: ${err.message}`;
    }
    showError(msg);
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
 * Convert RGBA ImageData to a Uint8Array boolean mask (1 = dark foreground).
 * Uses luminance formula: L = 0.299R + 0.587G + 0.114B
 */
function toGrayscaleMask(imageData, threshold = 80) {
  const { data } = imageData;
  const mask = new Uint8Array(PROC_W * PROC_H);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    mask[p] = gray < threshold ? 1 : 0;
  }
  return mask;
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
  // At sens=0.5: areaMin ≈ 6; at sens=1.0: areaMin=1; at sens=0.0: areaMin=18
  const areaMin = Math.max(1, Math.round(12 * (1.5 - sens)));
  const areaMax = Math.round(150 * (0.5 + sens));
  const AR_MIN  = 0.15;
  const AR_MAX  = 12.0;

  return blobs.filter(b =>
    b.area >= areaMin &&
    b.area <= areaMax &&
    b.aspectRatio >= AR_MIN &&
    b.aspectRatio <= AR_MAX
  );
}

/**
 * Inter-frame motion filter.
 * Keeps only blobs whose centroid has moved ≥ threshold px from the nearest
 * previous-frame blob within a 20 px match radius.
 * Blobs with no nearby predecessor (new arrivals) are always accepted.
 * Returns [] on the very first frame (no previous data).
 */
function motionFilter(blobs, prev, threshold = 1.5) {
  if (!prev || prev.length === 0) return [];   // first frame — seed state

  return blobs.filter(blob => {
    let bestDist = 20;     // match radius
    let matched  = false;

    for (const pb of prev) {
      const d = Math.hypot(blob.cx - pb.cx, blob.cy - pb.cy);
      if (d < bestDist) {
        bestDist = d;
        matched  = true;
      }
    }

    if (!matched) return true;          // new blob — no predecessor → accept
    return bestDist >= threshold;       // must have moved enough
  });
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
 * Returns { detections: [{bbox, proximity}], prevBlobs }
 */
function detect(imageData, sens, prev) {
  const mask       = toGrayscaleMask(imageData);
  let blobs        = findBlobs(mask, PROC_W, PROC_H);
  blobs            = filterBlobs(blobs, sens);
  const confirmed  = motionFilter(blobs, prev);

  // Sort largest (closest) first
  confirmed.sort((a, b) => b.area - a.area);

  const detections = confirmed.map(b => ({
    bbox:      b.bbox,
    proximity: computeProximity(b.area, FRAME_AREA),
  }));

  return { detections, prevBlobs: blobs };  // store all size-filtered blobs as prev
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. Audio alert (Web Audio API)
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
// 6. Animation loop & UI rendering
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Main per-frame loop.
 * Captures a frame, runs detection, updates audio and UI, then schedules itself.
 */
function animationLoop() {
  const imageData = captureFrame();

  if (imageData) {
    const result = detect(imageData, sensitivity, prevBlobs);
    prevBlobs = result.prevBlobs;

    const { detections } = result;
    const topScore = detections.length > 0 ? detections[0].proximity : 0;

    // ── Audio ──────────────────────────────────────────────────────────────
    if (detections.length > 0) {
      lastDetectionTime = Date.now();
      updateAudio(audioAlert, topScore);
    } else if (Date.now() - lastDetectionTime > SILENCE_MS) {
      updateAudio(audioAlert, 0);
    }

    // ── Visuals ────────────────────────────────────────────────────────────
    renderOverlay(detections);
    updateProximityUI(topScore);
  }

  rafId = requestAnimationFrame(animationLoop);
}

/**
 * Clear the overlay canvas and draw red bounding boxes for each detection,
 * scaling from processing resolution (PROC_W × PROC_H) to display size.
 */
function renderOverlay(detections) {
  const w = overlay.width;
  const h = overlay.height;
  overlayCtx.clearRect(0, 0, w, h);
  if (!detections.length) return;

  const scaleX = w / PROC_W;
  const scaleY = h / PROC_H;

  overlayCtx.strokeStyle = 'rgba(255, 40, 40, 0.9)';
  overlayCtx.lineWidth   = 2.5;

  for (const det of detections) {
    const { x, y, w: bw, h: bh } = det.bbox;
    overlayCtx.strokeRect(
      x  * scaleX,
      y  * scaleY,
      bw * scaleX,
      bh * scaleY,
    );
  }
}

/**
 * Update the proximity text label and progress bar.
 * score = 0 when nothing is detected.
 */
function updateProximityUI(score) {
  if (score > 0) {
    const pct   = Math.round(score * 100);
    const color = score < 0.4 ? '#44ff44'
                : score < 0.7 ? '#ffff00'
                :               '#ff4444';

    proximityText.textContent = `Proximity: ${pct} %`;
    document.documentElement.style.setProperty('--prox-color', color);
    proxBar.style.width = `${pct}%`;
  } else {
    proximityText.textContent = 'Proximity: —';
    proxBar.style.width = '0%';
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 7. Event wiring
// ═══════════════════════════════════════════════════════════════════════════

// ── Start / Stop ──────────────────────────────────────────────────────────
startBtn.addEventListener('click', async () => {
  if (!running) {
    // Create AudioContext on first user gesture — required by browser policy
    if (!audioAlert) {
      try {
        audioAlert = createAudioAlert();
      } catch (e) {
        console.warn('Audio initialisation failed:', e);
      }
    }

    stream = await startCamera(facingMode);
    if (!stream) return;   // startCamera already showed the error

    prevBlobs         = [];
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
    prevBlobs = [];
    updateAudio(audioAlert, 0);
    updateProximityUI(0);
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

  facingMode = facingMode === 'environment' ? 'user' : 'environment';
  prevBlobs  = [];
  overlayCtx.clearRect(0, 0, overlay.width, overlay.height);

  stream = await startCamera(facingMode);
  if (stream) {
    rafId = requestAnimationFrame(animationLoop);
  } else {
    // Camera switch failed — reset to stopped state
    running              = false;
    startBtn.textContent = '▶ Start';
    flipBtn.disabled     = true;
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

// ── Helpers ───────────────────────────────────────────────────────────────
function showError(msg) {
  errorMsg.textContent = msg;
  errorMsg.hidden      = false;
}

function hideError() {
  errorMsg.textContent = '';
  errorMsg.hidden      = true;
}
