"""audio_alert.py — Proximity-scaled looping audio alert for Pythonista 3 on iOS.

Plays a looping mosquito-buzz audio clip whose volume is proportional to the
current proximity score.  Silences automatically when no mosquito is detected
for more than SILENCE_TIMEOUT seconds.

Usage::

    alert = AudioAlert()
    alert.update(0.6)   # mosquito at ~60% proximity — medium volume
    alert.update(0.0)   # no detection — starts 1-s timeout, then stops
    alert.stop()        # immediate stop
"""

import logging
import os
import threading
import time

logger = logging.getLogger(__name__)

# How long to keep audio playing after proximity drops to 0 (seconds).
SILENCE_TIMEOUT = 1.0

# Path to the bundled buzz audio file, relative to this file.
_ASSET_NAME = 'buzz.wav'
_ASSET_DIR  = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'assets')
_ASSET_PATH = os.path.join(_ASSET_DIR, _ASSET_NAME)


class AudioAlert:
    """Proximity-driven looping audio alert.

    Thread-safe: ``update()`` and ``stop()`` may be called from any thread.

    Args:
        asset_path: Override the default path to the audio file.
                    If omitted, uses ``assets/buzz.wav`` next to this module.
    """

    def __init__(self, asset_path: str = None):
        self._path    = asset_path or _ASSET_PATH
        self._player  = None
        self._playing = False
        self._silent_mode = False      # True if asset failed to load
        self._lock    = threading.Lock()
        self._last_detection_time: float = 0.0
        self._silence_timer: threading.Timer = None
        self._load_player()

    # ── Public API ────────────────────────────────────────────────────────────

    def update(self, proximity_score: float) -> None:
        """Update playback state and volume based on the latest proximity score.

        Call this once per detection cycle (i.e., once per camera frame).

        Args:
            proximity_score: 0.0 = no detection / far; 1.0 = very close.
                             Must be in [0.0, 1.0].
        """
        score = float(max(0.0, min(1.0, proximity_score)))

        with self._lock:
            if self._silent_mode:
                return

            if score > 0.0:
                self._cancel_silence_timer()
                self._last_detection_time = time.time()
                self._set_volume(score)
                if not self._playing:
                    self._play()
            else:
                # No detection — schedule silence after timeout
                if self._playing and self._silence_timer is None:
                    self._schedule_silence_timer()

    def stop(self) -> None:
        """Immediately stop playback and release audio resources."""
        with self._lock:
            self._cancel_silence_timer()
            self._do_stop()

    @property
    def is_playing(self) -> bool:
        """True if the buzz audio is currently playing."""
        return self._playing

    # ── Internal ──────────────────────────────────────────────────────────────

    def _load_player(self) -> None:
        """Load the audio asset into a sound.Player instance."""
        try:
            import sound  # Pythonista 3 built-in
            if not os.path.isfile(self._path):
                raise FileNotFoundError(
                    f'Buzz audio asset not found: {self._path}\n'
                    f'Make sure assets/buzz.wav is in the project folder.'
                )
            player = sound.Player(self._path)
            player.number_of_loops = -1   # loop indefinitely
            player.volume          = 0.0
            self._player = player
            logger.info('AudioAlert: loaded %s', self._path)
        except ImportError:
            # Not running inside Pythonista 3 (e.g., during desktop unit tests)
            logger.warning(
                'AudioAlert: `sound` module not available — running in silent mode.'
            )
            self._silent_mode = True
        except Exception as exc:
            logger.warning('AudioAlert: failed to load audio asset — %s. '
                           'Running in silent mode.', exc)
            self._silent_mode = True

    def _play(self) -> None:
        """Start playback (must be called with self._lock held)."""
        try:
            self._player.play()
            self._playing = True
        except Exception as exc:
            logger.error('AudioAlert: play() failed — %s', exc)

    def _do_stop(self) -> None:
        """Stop playback (must be called with self._lock held)."""
        if self._player and self._playing:
            try:
                self._player.stop()
            except Exception as exc:
                logger.error('AudioAlert: stop() failed — %s', exc)
        self._playing = False

    def _set_volume(self, volume: float) -> None:
        """Set player volume (must be called with self._lock held)."""
        if self._player:
            try:
                self._player.volume = volume
            except Exception as exc:
                logger.error('AudioAlert: set volume failed — %s', exc)

    def _schedule_silence_timer(self) -> None:
        """Schedule a timer to stop audio after SILENCE_TIMEOUT seconds."""
        def _on_timeout():
            with self._lock:
                self._do_stop()
                self._silence_timer = None
        self._silence_timer = threading.Timer(SILENCE_TIMEOUT, _on_timeout)
        self._silence_timer.daemon = True
        self._silence_timer.start()

    def _cancel_silence_timer(self) -> None:
        """Cancel any pending silence timer (must be called with self._lock held)."""
        if self._silence_timer is not None:
            self._silence_timer.cancel()
            self._silence_timer = None
