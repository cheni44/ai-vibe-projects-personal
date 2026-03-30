## ADDED Requirements

### Requirement: Camera stream via getUserMedia
The system SHALL acquire a continuous camera video stream using `navigator.mediaDevices.getUserMedia({ video: { facingMode } })` and attach it to a hidden `<video>` element that autoplays and is muted.

#### Scenario: Camera permission granted
- **WHEN** the user taps the "Start" button and grants camera permission
- **THEN** the `<video>` element SHALL begin playing the live camera stream within 2 seconds

#### Scenario: Camera permission denied
- **WHEN** the user denies camera permission
- **THEN** the system SHALL display a human-readable error message explaining how to re-enable camera access and SHALL NOT throw an uncaught exception

#### Scenario: getUserMedia not supported
- **WHEN** the browser does not support `navigator.mediaDevices.getUserMedia`
- **THEN** the system SHALL display a message stating the browser is unsupported

### Requirement: Frame extraction to offscreen canvas
The system SHALL extract camera frames by calling `ctx.drawImage(videoElement, 0, 0, PROC_W, PROC_H)` on a hidden `<canvas>` of fixed processing resolution (96 × 72 px) inside a `requestAnimationFrame` loop, and SHALL make the resulting pixel data available to the detection module.

#### Scenario: Frame loop starts after stream ready
- **WHEN** the video stream has started and `video.readyState >= 2`
- **THEN** the `requestAnimationFrame` loop SHALL begin and deliver frames to the detector

#### Scenario: Frame loop stops when stream stopped
- **WHEN** the user clicks "Stop" or the view is closed
- **THEN** the `requestAnimationFrame` loop SHALL be cancelled and the camera stream tracks SHALL be stopped

### Requirement: Front and rear camera selection
The system SHALL support switching between the front and rear camera by re-calling `getUserMedia` with `facingMode: 'user'` or `facingMode: 'environment'`, defaulting to rear (`'environment'`).

#### Scenario: Default rear camera on start
- **WHEN** the app starts
- **THEN** the rear camera (`environment`) SHALL be requested by default

#### Scenario: Camera flip toggles facingMode
- **WHEN** the user taps the camera-flip button
- **THEN** the current stream SHALL be stopped, a new stream with the opposite `facingMode` SHALL be acquired, and the video element SHALL resume within 1 second
