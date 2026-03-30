"""detector.py — Image-heuristic mosquito detection for Pythonista 3 on iOS.

Pipeline (all on a 128 × 96 px downsampled frame for speed):
    1. preprocess()  — grayscale + Gaussian blur + threshold → binary mask
    2. _find_blobs() — BFS connected-component labeling on the small image
    3. _filter()     — size & aspect-ratio filter (scaled by sensitivity)
    4. motion filter — reject blobs that haven't moved across 3 frames
    5. proximity()   — bbox area → normalised 0-1 score

Usage::

    det = MosquitoDetector()
    detections = det.detect(pil_frame, sensitivity=0.5)
    for d in detections:
        print(d.bbox, d.proximity_score)
"""

from __future__ import annotations

import math
import logging
from collections import namedtuple
from typing import List, Optional, Tuple

import numpy as np
from PIL import Image, ImageFilter

logger = logging.getLogger(__name__)

# ── Processing constants ───────────────────────────────────────────────────────
PROC_W = 128          # processing-resolution width
PROC_H = 96           # processing-resolution height

# Threshold: pixels darker than this in the grayscale image are candidates.
# Lower → catches lighter mosquitoes; scale up to reduce false positives.
_DARK_THRESHOLD = 80

# Blob area limits (in px², at PROC_W × PROC_H resolution)
# At sensitivity=0.5 these are the defaults; scaled by sensitivity at runtime.
_AREA_MIN_BASE = 4    # px² minimum at sensitivity=1.0
_AREA_MAX_BASE = 300  # px² maximum at sensitivity=1.0

# Aspect ratio limits (width/height of bounding box)
_AR_MIN = 0.15        # very thin is ok (side-on mosquito)
_AR_MAX = 12.0        # very wide is ok (angled body)

# Motion filter
_MOTION_MIN_PX   = 1.5   # minimum blob centroid displacement per frame
_MOTION_STATIC_FRAMES = 3  # reject a blob after this many non-moving frames

# Proximity calibration: a blob whose area is PROXIMITY_MAX_AREA px² gets score 1.0
_PROXIMITY_MAX_AREA_RATIO = 0.02   # 2 % of frame area → proximity = 1.0


# ── Public types ──────────────────────────────────────────────────────────────

class Detection:
    """A confirmed mosquito detection within a single frame.

    Attributes:
        bbox:            (x, y, w, h) in *original* frame pixel coordinates.
        proximity_score: Normalised 0.0 (far/absent) to 1.0 (very close).
    """
    __slots__ = ('bbox', 'proximity_score')

    def __init__(self, bbox: Tuple[int, int, int, int], proximity_score: float):
        self.bbox            = bbox
        self.proximity_score = proximity_score

    def __repr__(self) -> str:
        return f'Detection(bbox={self.bbox}, proximity={self.proximity_score:.2f})'


# Internal blob record (at processing resolution)
_Blob = namedtuple('_Blob', ['cx', 'cy', 'bbox', 'area', 'aspect_ratio'])


# ── Preprocessing ─────────────────────────────────────────────────────────────

def preprocess(frame: Image.Image) -> np.ndarray:
    """Downsample, grayscale, blur, and threshold a PIL frame.

    Args:
        frame: RGB PIL Image of any size.

    Returns:
        Boolean numpy array of shape (PROC_H, PROC_W); True = dark candidate pixel.
    """
    small  = frame.resize((PROC_W, PROC_H), Image.BILINEAR)
    gray   = small.convert('L')
    blurred = gray.filter(ImageFilter.GaussianBlur(radius=1))
    arr    = np.array(blurred, dtype=np.uint8)
    return arr < _DARK_THRESHOLD   # True where pixel is dark


# ── Connected-component labeling (BFS) ───────────────────────────────────────

def _find_blobs(binary: np.ndarray) -> List[_Blob]:
    """BFS connected-component analysis on a boolean array.

    Args:
        binary: 2-D boolean numpy array (True = foreground pixel).

    Returns:
        List of _Blob named-tuples (at processing resolution).
    """
    rows, cols = binary.shape
    visited    = np.zeros((rows, cols), dtype=bool)
    blobs: List[_Blob] = []

    # Build index of foreground pixels once
    ys, xs = np.nonzero(binary)

    for (r0, c0) in zip(ys.tolist(), xs.tolist()):
        if visited[r0, c0]:
            continue

        # BFS from this seed
        stack  = [(r0, c0)]
        pixels = []
        visited[r0, c0] = True

        while stack:
            r, c = stack.pop()
            pixels.append((r, c))
            for nr, nc in ((r-1, c), (r+1, c), (r, c-1), (r, c+1)):
                if 0 <= nr < rows and 0 <= nc < cols:
                    if binary[nr, nc] and not visited[nr, nc]:
                        visited[nr, nc] = True
                        stack.append((nr, nc))

        area = len(pixels)
        if area < 2:
            continue

        rs = [p[0] for p in pixels]
        cs = [p[1] for p in pixels]
        min_r, max_r = min(rs), max(rs)
        min_c, max_c = min(cs), max(cs)
        bh = max_r - min_r + 1
        bw = max_c - min_c + 1
        cx = (min_c + max_c) / 2.0
        cy = (min_r + max_r) / 2.0
        ar = bw / bh if bh > 0 else 0.0
        blobs.append(_Blob(cx=cx, cy=cy, bbox=(min_c, min_r, bw, bh), area=area, aspect_ratio=ar))

    return blobs


# ── Size + aspect-ratio filter ────────────────────────────────────────────────

def _filter_blobs(blobs: List[_Blob], sensitivity: float) -> List[_Blob]:
    """Remove blobs that fail the size or aspect-ratio criteria.

    Sensitivity (0–1) scales the minimum area: higher sensitivity → catches
    smaller blobs.

    Args:
        blobs:       List of candidate blobs from _find_blobs().
        sensitivity: 0.0 (strict) to 1.0 (permissive).

    Returns:
        Filtered list of blobs.
    """
    # Map sensitivity linearly: at 0.5 → base minimum; at 1.0 → 1 px²; at 0.0 → 2× base
    area_min = max(1, int(_AREA_MIN_BASE * (2.0 - 2.0 * sensitivity + 0.5)))
    area_max = int(_AREA_MAX_BASE * (0.5 + sensitivity))

    result = []
    for b in blobs:
        if not (area_min <= b.area <= area_max):
            continue
        if not (_AR_MIN <= b.aspect_ratio <= _AR_MAX):
            continue
        result.append(b)
    return result


# ── Proximity calculation ─────────────────────────────────────────────────────

def compute_proximity(blob_area_px: int, frame_area_px: int) -> float:
    """Return a normalised proximity score for a detected blob.

    Score = min(1.0, blob_area / frame_area / PROXIMITY_MAX_AREA_RATIO)

    A blob covering 2 % of the frame area returns 1.0; smaller blobs
    return proportionally lower scores.

    Args:
        blob_area_px:  Blob area in pixels (at *processing* resolution).
        frame_area_px: Total frame area in pixels (PROC_W * PROC_H).

    Returns:
        Float in [0.0, 1.0].
    """
    ratio = blob_area_px / frame_area_px
    return min(1.0, ratio / _PROXIMITY_MAX_AREA_RATIO)


# ── Scale coords back to original frame ──────────────────────────────────────

def _scale_bbox(
    proc_bbox: Tuple[int, int, int, int],
    orig_w: int,
    orig_h: int,
) -> Tuple[int, int, int, int]:
    """Scale a bbox from processing resolution to original frame dimensions."""
    x, y, w, h = proc_bbox
    sx = orig_w / PROC_W
    sy = orig_h / PROC_H
    return (int(x * sx), int(y * sy), int(w * sx), int(h * sy))


# ── MosquitoDetector ─────────────────────────────────────────────────────────

class MosquitoDetector:
    """Per-frame mosquito detector using image heuristics.

    Maintains state across frames for the motion filter.

    Args:
        sensitivity:      Initial sensitivity (0.0–1.0).  Default 0.5.
        motion_threshold: Minimum centroid displacement in px to confirm motion.
    """

    def __init__(
        self,
        sensitivity: float = 0.5,
        motion_threshold: float = _MOTION_MIN_PX,
    ):
        self.sensitivity      = float(max(0.0, min(1.0, sensitivity)))
        self.motion_threshold = motion_threshold
        # Map from blob "identity" (int centroid bucket) → (cx, cy, static_count)
        self._prev_blobs: List[_Blob] = []

    # ── Public ────────────────────────────────────────────────────────────────

    def detect(self, frame: Image.Image, sensitivity: Optional[float] = None) -> List[Detection]:
        """Run the full detection pipeline on one frame.

        Args:
            frame:       RGB PIL Image from the camera.
            sensitivity: Override the instance sensitivity for this call.

        Returns:
            List of Detection objects (bboxes in original frame coordinates).
        """
        sens  = float(max(0.0, min(1.0, sensitivity if sensitivity is not None else self.sensitivity)))
        orig_w, orig_h = frame.size

        binary = preprocess(frame)
        blobs  = _find_blobs(binary)
        blobs  = _filter_blobs(blobs, sens)
        blobs  = self._apply_motion_filter(blobs)

        if not blobs:
            return []

        frame_area = PROC_W * PROC_H
        detections = []

        # Return all confirmed blobs, but only the largest as primary (first)
        blobs_sorted = sorted(blobs, key=lambda b: b.area, reverse=True)
        for blob in blobs_sorted:
            proximity = compute_proximity(blob.area, frame_area)
            orig_bbox = _scale_bbox(blob.bbox, orig_w, orig_h)
            detections.append(Detection(bbox=orig_bbox, proximity_score=proximity))

        return detections

    def reset(self) -> None:
        """Clear inter-frame state (e.g., when camera changes)."""
        self._prev_blobs = []

    # ── Internal ──────────────────────────────────────────────────────────────

    def _apply_motion_filter(self, blobs: List[_Blob]) -> List[_Blob]:
        """Keep only blobs that have moved since the last frame.

        Blobs that stay at the same position for more than
        ``_MOTION_STATIC_FRAMES`` consecutive frames are rejected.

        Uses centroid-distance matching between current and previous blobs.
        """
        if not self._prev_blobs:
            # First frame — accept all (can't measure motion yet)
            self._prev_blobs = blobs
            return []   # wait for the second frame to start confirming

        confirmed = []
        for blob in blobs:
            matched_prev = self._nearest_prev(blob)
            if matched_prev is None:
                # New blob — no previous match → accept (first appearance)
                confirmed.append(blob)
            else:
                dist = math.hypot(blob.cx - matched_prev.cx, blob.cy - matched_prev.cy)
                if dist >= self.motion_threshold:
                    confirmed.append(blob)
                # else: static — reject

        self._prev_blobs = blobs
        return confirmed

    def _nearest_prev(self, blob: _Blob) -> Optional[_Blob]:
        """Return the previous-frame blob nearest to the given blob, or None."""
        if not self._prev_blobs:
            return None
        # Match within 20 px (processing resolution) to guard against ID-swap
        best_dist = 20.0
        best      = None
        for pb in self._prev_blobs:
            d = math.hypot(blob.cx - pb.cx, blob.cy - pb.cy)
            if d < best_dist:
                best_dist = d
                best      = pb
        return best
