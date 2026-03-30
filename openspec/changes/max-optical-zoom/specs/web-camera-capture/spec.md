## MODIFIED Requirements

### Requirement: Camera stream via getUserMedia
The system SHALL acquire a continuous camera video stream using `navigator.mediaDevices.getUserMedia({ video: { facingMode } })` and attach it to a hidden `<video>` element that autoplays and is muted. After the stream is obtained, the system SHALL attempt to apply maximum optical zoom to the video track (see `camera-max-zoom` spec).

#### Scenario: Camera permission granted
- **WHEN** the user taps the "Start" button and grants camera permission
- **THEN** the `<video>` element SHALL begin playing the live camera stream within 2 seconds

#### Scenario: Camera permission granted with zoom support
- **WHEN** the device supports zoom and the stream is acquired
- **THEN** the camera SHALL apply maximum zoom before the first detection frame is processed

#### Scenario: Camera permission denied
- **WHEN** the user denies camera permission
- **THEN** the system SHALL display a human-readable error message explaining how to re-enable camera access and SHALL NOT throw an uncaught exception

#### Scenario: getUserMedia not supported
- **WHEN** the browser does not support `navigator.mediaDevices.getUserMedia`
- **THEN** the system SHALL display a message stating the browser is unsupported
