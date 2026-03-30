"""camera.py — Continuous AVFoundation camera capture for Pythonista 3 on iOS.

Bridges AVCaptureSession / AVCaptureVideoDataOutput via objc_util.
Each captured frame is delivered as a PIL Image (RGB) to registered callbacks.

Usage::

    cam = CameraCapture(position='back', resolution='medium')
    cam.add_frame_callback(lambda img: print(img.size))
    cam.start()
    # ... app runs ...
    cam.stop()
"""

import ctypes
import logging
import threading

from objc_util import ObjCClass, create_objc_class, ns
from PIL import Image

logger = logging.getLogger(__name__)

# ── CoreMedia / CoreVideo via ctypes ─────────────────────────────────────────
_cm = ctypes.CDLL('/System/Library/Frameworks/CoreMedia.framework/CoreMedia')
_cv = ctypes.CDLL('/System/Library/Frameworks/CoreVideo.framework/CoreVideo')

_cm.CMSampleBufferGetImageBuffer.restype  = ctypes.c_void_p
_cm.CMSampleBufferGetImageBuffer.argtypes = [ctypes.c_void_p]

_cv.CVPixelBufferLockBaseAddress.restype  = ctypes.c_int
_cv.CVPixelBufferLockBaseAddress.argtypes = [ctypes.c_void_p, ctypes.c_uint64]

_cv.CVPixelBufferUnlockBaseAddress.restype  = ctypes.c_int
_cv.CVPixelBufferUnlockBaseAddress.argtypes = [ctypes.c_void_p, ctypes.c_uint64]

_cv.CVPixelBufferGetBaseAddress.restype  = ctypes.c_void_p
_cv.CVPixelBufferGetBaseAddress.argtypes = [ctypes.c_void_p]

_cv.CVPixelBufferGetWidth.restype  = ctypes.c_size_t
_cv.CVPixelBufferGetWidth.argtypes = [ctypes.c_void_p]

_cv.CVPixelBufferGetHeight.restype  = ctypes.c_size_t
_cv.CVPixelBufferGetHeight.argtypes = [ctypes.c_void_p]

_cv.CVPixelBufferGetBytesPerRow.restype  = ctypes.c_size_t
_cv.CVPixelBufferGetBytesPerRow.argtypes = [ctypes.c_void_p]

# ── libdispatch for the capture queue ────────────────────────────────────────
_dispatch = ctypes.CDLL('/usr/lib/system/libdispatch.dylib')
_dispatch.dispatch_queue_create.restype  = ctypes.c_void_p
_dispatch.dispatch_queue_create.argtypes = [ctypes.c_char_p, ctypes.c_void_p]

# ── AVFoundation constants ────────────────────────────────────────────────────
PRESETS = {
    'low':    'AVCaptureSessionPresetLow',
    'medium': 'AVCaptureSessionPresetMedium',
    'high':   'AVCaptureSessionPresetHigh',
}

# AVCaptureDevicePosition
_POS_BACK  = 1
_POS_FRONT = 2

# AVAuthorizationStatus
_AUTH_AUTHORIZED = 3
_AUTH_DENIED     = 2

# kCVPixelFormatType_32BGRA
_PIXEL_FORMAT_BGRA = 0x42475241


class CameraPermissionError(RuntimeError):
    """Raised when iOS has denied camera access for Pythonista 3."""


# ── Frame conversion ──────────────────────────────────────────────────────────

def _sample_buffer_to_pil(sample_buffer_ptr: int) -> Image.Image:
    """Convert a raw CMSampleBufferRef pointer to an RGB PIL Image.

    Args:
        sample_buffer_ptr: Integer value of the CMSampleBufferRef pointer.

    Returns:
        RGB PIL Image of the captured frame.
    """
    image_buffer = _cm.CMSampleBufferGetImageBuffer(sample_buffer_ptr)
    _cv.CVPixelBufferLockBaseAddress(image_buffer, 0)
    try:
        base_addr = _cv.CVPixelBufferGetBaseAddress(image_buffer)
        width     = int(_cv.CVPixelBufferGetWidth(image_buffer))
        height    = int(_cv.CVPixelBufferGetHeight(image_buffer))
        bpr       = int(_cv.CVPixelBufferGetBytesPerRow(image_buffer))
        raw       = (ctypes.c_uint8 * (bpr * height)).from_address(base_addr)
        img = Image.frombuffer(
            'RGBA', (width, height), bytes(raw), 'raw', 'BGRA', bpr, 1
        )
        return img.convert('RGB')
    finally:
        _cv.CVPixelBufferUnlockBaseAddress(image_buffer, 0)


# ── CameraCapture ─────────────────────────────────────────────────────────────

class CameraCapture:
    """Continuous camera frame capture using AVFoundation via objc_util.

    Delivers each frame as a PIL Image (RGB) to all registered callbacks.
    Frame delivery happens on a background thread; callbacks should be
    thread-safe (e.g., post UI updates via on_main_thread).

    Args:
        position:   ``'back'`` (default) or ``'front'``.
        resolution: ``'low'``, ``'medium'`` (default), or ``'high'``.
    """

    def __init__(self, position: str = 'back', resolution: str = 'medium'):
        self._position   = _POS_BACK if position == 'back' else _POS_FRONT
        self._resolution = PRESETS.get(resolution, PRESETS['medium'])
        self._callbacks: list = []
        self._lock       = threading.Lock()
        self._session    = None
        self._delegate   = None
        self._running    = False
        self._create_delegate()

    # ── Public API ────────────────────────────────────────────────────────────

    def add_frame_callback(self, fn) -> None:
        """Register a callable ``fn(pil_image: PIL.Image)`` for every frame."""
        with self._lock:
            self._callbacks.append(fn)

    def remove_frame_callback(self, fn) -> None:
        """Unregister a previously registered callback."""
        with self._lock:
            self._callbacks = [c for c in self._callbacks if c is not fn]

    def start(self) -> None:
        """Start the capture session.

        Raises:
            CameraPermissionError: If iOS has denied camera access.
        """
        self._assert_permission()
        if self._running:
            return
        self._build_session()
        self._session.startRunning()
        self._running = True
        logger.info(
            'Camera started — position=%s  preset=%s',
            self.position, self._resolution
        )

    def stop(self) -> None:
        """Stop the capture session and release all camera resources."""
        if not self._running:
            return
        self._session.stopRunning()
        self._session = None
        self._running = False
        logger.info('Camera stopped')

    def switch_camera(self) -> None:
        """Toggle between front and rear camera."""
        was_running = self._running
        if was_running:
            self.stop()
        self._position = (
            _POS_FRONT if self._position == _POS_BACK else _POS_BACK
        )
        if was_running:
            self.start()

    def set_resolution(self, resolution: str) -> None:
        """Change capture resolution. Restarts the session if currently running.

        Args:
            resolution: ``'low'``, ``'medium'``, or ``'high'``.
        """
        preset = PRESETS.get(resolution, PRESETS['medium'])
        if preset == self._resolution:
            return
        self._resolution = preset
        if self._running:
            self.stop()
            self.start()

    @property
    def is_running(self) -> bool:
        """True if the capture session is currently active."""
        return self._running

    @property
    def position(self) -> str:
        """Current camera position: ``'back'`` or ``'front'``."""
        return 'back' if self._position == _POS_BACK else 'front'

    # ── Internal ──────────────────────────────────────────────────────────────

    def _assert_permission(self) -> None:
        """Check AVAuthorization status; raise CameraPermissionError if denied."""
        AVCaptureDevice = ObjCClass('AVCaptureDevice')
        status = int(AVCaptureDevice.authorizationStatusForMediaType_(ns('vide')))
        if status == _AUTH_DENIED:
            raise CameraPermissionError(
                'Camera access denied.\n'
                'Go to: Settings → Privacy & Security → Camera → Pythonista 3 → ON'
            )

    def _build_session(self) -> None:
        """Construct and configure the AVCaptureSession."""
        AVCaptureSession         = ObjCClass('AVCaptureSession')
        AVCaptureDevice          = ObjCClass('AVCaptureDevice')
        AVCaptureDeviceInput     = ObjCClass('AVCaptureDeviceInput')
        AVCaptureVideoDataOutput = ObjCClass('AVCaptureVideoDataOutput')

        session = AVCaptureSession.new()
        session.setSessionPreset_(ns(self._resolution))

        # Select the requested camera device
        devices = AVCaptureDevice.devicesWithMediaType_(ns('vide'))
        device  = None
        for d in devices:
            if int(d.position()) == self._position:
                device = d
                break
        if device is None:
            device = AVCaptureDevice.defaultDeviceWithMediaType_(ns('vide'))

        device_input = AVCaptureDeviceInput.deviceInputWithDevice_error_(
            device, None
        )
        if session.canAddInput_(device_input):
            session.addInput_(device_input)

        # Configure video output — request 32BGRA pixel format
        output = AVCaptureVideoDataOutput.new()
        output.setVideoSettings_({ns('PixelFormatType'): _PIXEL_FORMAT_BGRA})
        output.setAlwaysDiscardsLateVideoFrames_(True)

        # Serial dispatch queue for the sample-buffer delegate
        dq = _dispatch.dispatch_queue_create(b'com.mosquito.capture.queue', None)
        output.setSampleBufferDelegate_queue_(self._delegate, dq)

        if session.canAddOutput_(output):
            session.addOutput_(output)

        self._session = session

    def _create_delegate(self) -> None:
        """Build a one-shot ObjC class that forwards sample buffers to Python."""
        capture_ref = self

        def captureOutput_didOutputSampleBuffer_fromConnection_(
            _self, _cmd, _output, sample_buffer, _connection
        ):
            """AVCaptureVideoDataOutputSampleBufferDelegate callback."""
            try:
                img = _sample_buffer_to_pil(sample_buffer)
                with capture_ref._lock:
                    cbs = list(capture_ref._callbacks)
                for cb in cbs:
                    try:
                        cb(img)
                    except Exception as exc:
                        logger.error('Frame callback raised: %s', exc)
            except Exception as exc:
                logger.error('Frame decode error: %s', exc)

        DelegateClass = create_objc_class(
            'MosquitoCaptureDelegate',
            methods=[captureOutput_didOutputSampleBuffer_fromConnection_],
            protocols=['AVCaptureVideoDataOutputSampleBufferDelegate'],
        )
        self._delegate = DelegateClass.new()
