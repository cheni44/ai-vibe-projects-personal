"""main.py — Entry point for the Mosquito Detector app (Pythonista 3 on iOS).

Run this file from Pythonista 3:
    1. Open main.py
    2. Tap ▶ (Run)
    3. Grant camera access when iOS prompts

The app presents a full-screen view with:
    - Live camera preview with bounding-box overlay
    - Proximity readout label
    - Sensitivity slider
    - Front/rear camera toggle button

Audio: a looping mosquito-buzz sound plays when a mosquito is detected;
volume scales with the detected proximity (0.0 – 1.0).
"""

import logging

# Configure basic logging so errors surface in Pythonista's console
logging.basicConfig(
    level=logging.INFO,
    format='[%(levelname)s] %(name)s: %(message)s',
)
logger = logging.getLogger(__name__)

from camera      import CameraCapture, CameraPermissionError
from detector    import MosquitoDetector
from audio_alert import AudioAlert
from ui_view     import MosquitoDetectorView


def main() -> None:
    # ── Instantiate modules ───────────────────────────────────────────────────
    camera   = CameraCapture(position='back', resolution='medium')
    detector = MosquitoDetector(sensitivity=0.5)
    audio    = AudioAlert()
    view     = MosquitoDetectorView(camera=camera, detector=detector, audio=audio)

    # ── Register the per-frame processing callback ────────────────────────────
    def on_frame(pil_image):
        """Called on the capture background thread for every camera frame."""
        try:
            detections = detector.detect(pil_image)

            # Proximity = score of the primary (largest / closest) detection
            proximity = detections[0].proximity_score if detections else 0.0
            audio.update(proximity)

            # Update UI on the main thread (on_main_thread is applied inside)
            view.update_frame(pil_image, detections)
        except Exception as exc:
            logger.error('Frame processing error: %s', exc)

    camera.add_frame_callback(on_frame)

    # ── Start camera and show the UI ──────────────────────────────────────────
    try:
        camera.start()
    except CameraPermissionError as exc:
        import ui
        ui.alert(
            title='Camera Access Required',
            message=str(exc),
            button1='OK',
        )
        return
    except Exception as exc:
        logger.error('Failed to start camera: %s', exc)
        import ui
        ui.alert(
            title='Camera Error',
            message=f'Could not start camera:\n{exc}',
            button1='OK',
        )
        return

    # present() blocks until the user dismisses the view.
    # will_close() in MosquitoDetectorView handles camera + audio shutdown.
    view.present('fullscreen')


if __name__ == '__main__':
    main()
