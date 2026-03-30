"""test_detector.py — Self-contained tests for detector.py helper functions.

Run inside Pythonista 3 or on a desktop Python that has Pillow + numpy:
    python test_detector.py

Tests do NOT require camera access or iOS hardware.
"""

import sys
import traceback
import numpy as np
from PIL import Image

# Import the modules under test (camera-independent helpers only)
from detector import (
    preprocess,
    _find_blobs,
    _filter_blobs,
    compute_proximity,
    _scale_bbox,
    MosquitoDetector,
    Detection,
    PROC_W,
    PROC_H,
)

# ── Test helpers ──────────────────────────────────────────────────────────────

_pass = 0
_fail = 0


def ok(name: str, condition: bool, msg: str = '') -> None:
    global _pass, _fail
    if condition:
        print(f'  PASS  {name}')
        _pass += 1
    else:
        print(f'  FAIL  {name}' + (f' — {msg}' if msg else ''))
        _fail += 1


def _make_frame(width: int = 640, height: int = 480, bg: int = 200) -> Image.Image:
    """Return a uniform light-grey RGB frame."""
    return Image.new('RGB', (width, height), (bg, bg, bg))


def _add_dark_blob(img: Image.Image, x: int, y: int, w: int, h: int, val: int = 30) -> Image.Image:
    """Paint a dark rectangle onto an RGB image (in-place)."""
    img = img.copy()
    for row in range(y, y + h):
        for col in range(x, x + w):
            img.putpixel((col, row), (val, val, val))
    return img


# ── Tests ─────────────────────────────────────────────────────────────────────

def test_preprocess_no_blob():
    """A uniform bright frame should produce an all-False binary mask."""
    frame  = _make_frame(bg=200)
    binary = preprocess(frame)
    ok('preprocess: no-blob frame → all False', not binary.any(),
       f'found {binary.sum()} dark pixels')


def test_preprocess_dark_blob():
    """A frame with a dark patch should produce some True pixels.

    The blob must be large enough (≥10× Gaussian radius in orig coords)
    to survive the resize + blur without washing out.
    """
    frame  = _make_frame(bg=200)
    # Use a blob that maps to ~20×12 px after 640→128 resize, well above blur radius=1
    frame  = _add_dark_blob(frame, x=100, y=100, w=100, h=60, val=20)
    binary = preprocess(frame)
    ok('preprocess: dark blob → some True pixels', binary.any(),
       'no dark pixels found')


def test_preprocess_output_shape():
    binary = preprocess(_make_frame(640, 480))
    ok('preprocess: output shape is (PROC_H, PROC_W)',
       binary.shape == (PROC_H, PROC_W),
       f'got {binary.shape}')


def test_find_blobs_empty():
    binary = np.zeros((PROC_H, PROC_W), dtype=bool)
    blobs  = _find_blobs(binary)
    ok('_find_blobs: empty mask → no blobs', len(blobs) == 0)


def test_find_blobs_single():
    binary = np.zeros((PROC_H, PROC_W), dtype=bool)
    binary[10:14, 20:26] = True   # 4×6 = 24 px blob
    blobs  = _find_blobs(binary)
    ok('_find_blobs: one blob found', len(blobs) == 1, f'got {len(blobs)}')
    if blobs:
        ok('_find_blobs: blob area ~= 24', abs(blobs[0].area - 24) <= 2,
           f'area={blobs[0].area}')


def test_find_blobs_two_separated():
    binary = np.zeros((PROC_H, PROC_W), dtype=bool)
    binary[10:14, 10:16] = True   # blob A
    binary[50:54, 60:66] = True   # blob B — far from A
    blobs = _find_blobs(binary)
    ok('_find_blobs: two separated blobs', len(blobs) == 2, f'got {len(blobs)}')


def test_filter_blobs_rejects_too_small():
    binary = np.zeros((PROC_H, PROC_W), dtype=bool)
    binary[10, 10] = True   # 1-pixel blob → too small
    blobs    = _find_blobs(binary)
    filtered = _filter_blobs(blobs, sensitivity=0.5)
    ok('_filter_blobs: rejects 1-pixel blob', len(filtered) == 0,
       f'got {len(filtered)} blobs')


def test_filter_blobs_accepts_medium():
    binary = np.zeros((PROC_H, PROC_W), dtype=bool)
    binary[20:24, 20:26] = True   # 4×6=24 px, ar=6/4=1.5 — should pass at 0.5
    blobs    = _find_blobs(binary)
    filtered = _filter_blobs(blobs, sensitivity=0.5)
    ok('_filter_blobs: accepts medium blob at sensitivity=0.5', len(filtered) >= 1,
       f'got {len(filtered)}')


def test_compute_proximity_large():
    frame_area = PROC_W * PROC_H   # 12 288
    # Use round() so blob_area / frame_area == exactly 0.02
    blob_area  = round(frame_area * 0.02)
    score      = compute_proximity(blob_area, frame_area)
    ok('compute_proximity: 2% area → score ~= 1.0', abs(score - 1.0) < 0.01,
       f'score={score}')


def test_compute_proximity_small():
    frame_area = PROC_W * PROC_H
    blob_area  = int(frame_area * 0.001)   # 0.1 % → score ≤ 0.1
    score      = compute_proximity(blob_area, frame_area)
    ok('compute_proximity: 0.1% area → score ≤ 0.1', score <= 0.1 + 1e-9,
       f'score={score}')


def test_compute_proximity_clamped():
    frame_area = PROC_W * PROC_H
    score      = compute_proximity(frame_area, frame_area)  # 100% → clamp to 1.0
    ok('compute_proximity: clamped to 1.0', score == 1.0, f'score={score}')


def test_scale_bbox():
    proc_bbox = (10, 5, 20, 10)
    scaled    = _scale_bbox(proc_bbox, orig_w=640, orig_h=480)
    ex        = (int(10*640/PROC_W), int(5*480/PROC_H),
                 int(20*640/PROC_W), int(10*480/PROC_H))
    ok('_scale_bbox: correct scaling', scaled == ex, f'{scaled} != {ex}')


def test_detector_no_blob():
    frame = _make_frame(bg=200)
    det   = MosquitoDetector(sensitivity=0.5)
    dets  = det.detect(frame)
    ok('MosquitoDetector: uniform frame → no detections', len(dets) == 0,
       f'got {len(dets)}')


def test_detector_returns_detection_type():
    frame = _make_frame(bg=200)
    frame = _add_dark_blob(frame, x=100, y=100, w=25, h=10)
    det   = MosquitoDetector(sensitivity=0.8)
    # Two-frame cycle needed (motion filter waits for frame 2)
    det.detect(frame)            # frame 1 — seeds motion state
    dets = det.detect(frame)     # frame 2 — same pos → static (may be 0)
    # Either 0 (static filtered) or Detection objects — just check type
    ok('MosquitoDetector: returns list', isinstance(dets, list))
    for d in dets:
        ok('MosquitoDetector: element is Detection', isinstance(d, Detection))


def test_detector_reset():
    det = MosquitoDetector()
    det.detect(_make_frame())
    det.reset()
    ok('MosquitoDetector.reset: clears prev_blobs', det._prev_blobs == [])


# ── Runner ────────────────────────────────────────────────────────────────────

TESTS = [
    test_preprocess_no_blob,
    test_preprocess_dark_blob,
    test_preprocess_output_shape,
    test_find_blobs_empty,
    test_find_blobs_single,
    test_find_blobs_two_separated,
    test_filter_blobs_rejects_too_small,
    test_filter_blobs_accepts_medium,
    test_compute_proximity_large,
    test_compute_proximity_small,
    test_compute_proximity_clamped,
    test_scale_bbox,
    test_detector_no_blob,
    test_detector_returns_detection_type,
    test_detector_reset,
]


def run_all():
    print(f'\n=== detector.py unit tests ({len(TESTS)} total) ===\n')
    for t in TESTS:
        try:
            t()
        except Exception:
            global _fail
            print(f'  ERROR {t.__name__}')
            traceback.print_exc()
            _fail += 1
    print(f'\n{"All tests passed!" if _fail == 0 else f"{_fail} test(s) FAILED"} '
          f'({_pass} passed, {_fail} failed)\n')
    sys.exit(0 if _fail == 0 else 1)


if __name__ == '__main__':
    run_all()
