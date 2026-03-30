## ADDED Requirements

### Requirement: Continuous camera frame capture
The system SHALL capture a continuous stream of video frames from the device camera at a minimum of 10 frames per second using AVFoundation via `objc_util`, and deliver each frame as a PIL Image object to registered frame-consumer callbacks.

#### Scenario: Capture session starts successfully
- **WHEN** the user launches the app and grants camera permission
- **THEN** the capture session SHALL start within 3 seconds and begin delivering frames to registered callbacks

#### Scenario: Frame delivery at minimum rate
- **WHEN** the capture session is running
- **THEN** frames SHALL be delivered to callbacks at a rate of at least 10 fps on any device running iOS 14 or later

#### Scenario: Camera permission denied
- **WHEN** the user denies camera permission
- **THEN** the system SHALL display an error message explaining that camera access is required and SHALL NOT crash

#### Scenario: Capture session stops on app exit
- **WHEN** the Pythonista 3 script is stopped or the view is closed
- **THEN** the capture session SHALL stop and release all camera resources

### Requirement: Configurable capture resolution
The system SHALL support selectable capture resolutions (low, medium, high) corresponding to AVFoundation session presets, defaulting to medium.

#### Scenario: Default resolution on first launch
- **WHEN** the app starts for the first time
- **THEN** the capture session SHALL use medium resolution (`AVCaptureSessionPresetMedium`)

#### Scenario: Resolution change at runtime
- **WHEN** the user selects a different resolution from the settings
- **THEN** the capture session SHALL restart with the new preset within 2 seconds

### Requirement: Front and rear camera selection
The system SHALL allow the user to select either the front or rear camera, defaulting to the rear camera.

#### Scenario: Default to rear camera
- **WHEN** the app starts
- **THEN** the rear camera SHALL be used by default

#### Scenario: Switch camera
- **WHEN** the user taps the camera-switch control
- **THEN** the capture session SHALL switch to the other camera within 1 second without crashing
