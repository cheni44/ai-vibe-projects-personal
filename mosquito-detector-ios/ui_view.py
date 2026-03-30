"""ui_view.py — Main UI for the Mosquito Detector app (Pythonista 3 on iOS).

Single-screen layout:
    ┌─────────────────────────────┐
    │  🔄  Flip Camera            │
    │  ┌─────────────────────┐   │
    │  │  Live camera preview │   │
    │  │  + bounding boxes   │   │
    │  └─────────────────────┘   │
    │  Proximity: 42 %           │
    │  Sensitivity: ─────●───   │
    └─────────────────────────────┘

Usage::

    view = MosquitoDetectorView(camera=cam, detector=det, audio=alert)
    view.present('fullscreen')
"""

import io
import logging
from typing import List, Optional, TYPE_CHECKING

import ui                          # Pythonista 3 built-in
from objc_util import on_main_thread
from PIL import Image, ImageDraw

if TYPE_CHECKING:
    from camera import CameraCapture
    from detector import Detection, MosquitoDetector
    from audio_alert import AudioAlert

logger = logging.getLogger(__name__)

# Bounding-box overlay colour (R, G, B, A)
_BBOX_COLOUR = (255, 30, 30, 220)
_BBOX_WIDTH  = 3


def _pil_to_ui_image(pil_img: Image.Image) -> 'ui.Image':
    """Convert a PIL Image to a Pythonista ui.Image via PNG bytes."""
    buf = io.BytesIO()
    pil_img.save(buf, format='PNG')
    return ui.Image.from_data(buf.getvalue())


def _annotate(
    pil_img: Image.Image,
    detections: List['Detection'],
) -> Image.Image:
    """Draw red bounding boxes for each detection onto a copy of pil_img."""
    if not detections:
        return pil_img
    annotated = pil_img.copy()
    draw      = ImageDraw.Draw(annotated)
    for det in detections:
        x, y, w, h = det.bbox
        for t in range(_BBOX_WIDTH):
            draw.rectangle(
                [x - t, y - t, x + w + t, y + h + t],
                outline=_BBOX_COLOUR,
            )
    return annotated


class MosquitoDetectorView(ui.View):
    """Full-screen Mosquito Detector UI.

    Args:
        camera:   CameraCapture instance (already configured, not yet started).
        detector: MosquitoDetector instance.
        audio:    AudioAlert instance.
    """

    def __init__(
        self,
        camera: 'CameraCapture',
        detector: 'MosquitoDetector',
        audio: 'AudioAlert',
        **kwargs,
    ):
        super().__init__(**kwargs)
        self._camera   = camera
        self._detector = detector
        self._audio    = audio
        self._setup_ui()

    # ── ui.View lifecycle ─────────────────────────────────────────────────────

    def layout(self) -> None:
        """Called by Pythonista whenever the view is resized / rotated."""
        self._layout_subviews()

    def will_close(self) -> None:
        """Stop camera and audio when the user dismisses the view."""
        try:
            self._camera.stop()
        except Exception as exc:
            logger.error('Error stopping camera: %s', exc)
        try:
            self._audio.stop()
        except Exception as exc:
            logger.error('Error stopping audio: %s', exc)

    # ── Public: frame update (called from main.py frame callback) ─────────────

    @on_main_thread
    def update_frame(
        self,
        pil_image: Image.Image,
        detections: List['Detection'],
    ) -> None:
        """Refresh the live preview and proximity readout.

        Must be called on the main thread (``on_main_thread`` decorator handles
        the dispatch when called from a background camera thread).

        Args:
            pil_image:  Raw camera frame (RGB PIL Image).
            detections: List of Detection objects for this frame.
        """
        annotated       = _annotate(pil_image, detections)
        self._preview.image = _pil_to_ui_image(annotated)
        self._update_proximity_label(detections)

    # ── UI construction ───────────────────────────────────────────────────────

    def _setup_ui(self) -> None:
        self.background_color = '#1a1a1a'
        self.name             = 'Mosquito Detector'

        # Camera-switch button
        btn = ui.Button()
        btn.title        = '🔄 Flip Camera'
        btn.tint_color   = 'white'
        btn.border_color = 'white'
        btn.border_width = 1
        btn.corner_radius = 6
        btn.action       = self._on_flip_camera
        btn.name         = 'flip_btn'
        self.add_subview(btn)
        self._flip_btn = btn

        # Live camera preview
        img_view = ui.ImageView()
        img_view.content_mode = ui.CONTENT_SCALE_ASPECT_FIT
        img_view.background_color = 'black'
        img_view.name = 'preview'
        self.add_subview(img_view)
        self._preview = img_view

        # Proximity label
        prox_lbl = ui.Label()
        prox_lbl.text            = 'Proximity: None'
        prox_lbl.text_color      = 'white'
        prox_lbl.alignment       = ui.ALIGN_CENTER
        prox_lbl.font            = ('<system-bold>', 18)
        prox_lbl.name            = 'proximity_label'
        self.add_subview(prox_lbl)
        self._prox_label = prox_lbl

        # Sensitivity label
        sens_lbl = ui.Label()
        sens_lbl.text       = 'Sensitivity'
        sens_lbl.text_color = '#aaaaaa'
        sens_lbl.alignment  = ui.ALIGN_CENTER
        sens_lbl.font       = ('<system>', 14)
        self.add_subview(sens_lbl)
        self._sens_label = sens_lbl

        # Sensitivity slider (default 0.5)
        slider = ui.Slider()
        slider.value   = 0.5
        slider.action  = self._on_sensitivity_change
        slider.name    = 'sensitivity_slider'
        self.add_subview(slider)
        self._slider = slider

    def _layout_subviews(self) -> None:
        """Compute subview frames from self.bounds."""
        w, h = self.width, self.height
        pad  = 12

        # Flip button — top strip
        btn_h = 44
        self._flip_btn.frame = (pad, pad, w - 2 * pad, btn_h)

        # Preview — takes most of the remaining space
        prox_h  = 36
        sens_h  = 30
        sldr_h  = 36
        ctrl_h  = prox_h + sens_h + sldr_h + 3 * pad
        prev_y  = pad + btn_h + pad
        prev_h  = h - prev_y - ctrl_h - pad
        self._preview.frame = (0, prev_y, w, max(prev_h, 100))

        # Proximity label
        prox_y = prev_y + max(prev_h, 100) + pad
        self._prox_label.frame = (pad, prox_y, w - 2 * pad, prox_h)

        # Sensitivity label
        sens_y = prox_y + prox_h + pad // 2
        self._sens_label.frame = (pad, sens_y, w - 2 * pad, sens_h)

        # Sensitivity slider
        sldr_y = sens_y + sens_h + pad // 2
        self._slider.frame = (pad, sldr_y, w - 2 * pad, sldr_h)

    # ── Control actions ───────────────────────────────────────────────────────

    def _on_flip_camera(self, sender) -> None:
        """Toggle front / rear camera."""
        try:
            self._camera.switch_camera()
            self._detector.reset()   # Clear motion state after camera switch
        except Exception as exc:
            logger.error('Camera switch failed: %s', exc)

    def _on_sensitivity_change(self, sender) -> None:
        """Forward slider value to the detector in real time."""
        self._detector.sensitivity = sender.value

    # ── Helpers ───────────────────────────────────────────────────────────────

    def _update_proximity_label(self, detections: List['Detection']) -> None:
        """Update the proximity readout label."""
        if detections:
            score = detections[0].proximity_score   # primary (largest) detection
            self._prox_label.text       = f'Proximity: {int(score * 100)} %'
            # Colour: green → yellow → red as proximity increases
            if score < 0.4:
                self._prox_label.text_color = '#44ff44'
            elif score < 0.7:
                self._prox_label.text_color = '#ffff00'
            else:
                self._prox_label.text_color = '#ff4444'
        else:
            self._prox_label.text       = 'Proximity: None'
            self._prox_label.text_color = 'white'
