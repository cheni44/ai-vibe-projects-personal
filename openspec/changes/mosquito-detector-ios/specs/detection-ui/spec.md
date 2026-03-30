## ADDED Requirements

### Requirement: Live camera preview with detection overlay
The system SHALL display a live camera preview in a `ui.ImageView`, updated at the frame-delivery rate, with bounding boxes drawn around detected mosquitoes and a proximity meter indicator.

#### Scenario: Preview updates in real time
- **WHEN** the capture session is running
- **THEN** the `ui.ImageView` SHALL be refreshed with each new annotated frame on the main thread

#### Scenario: Bounding box drawn on detection
- **WHEN** a mosquito is detected in a frame
- **THEN** a rectangle SHALL be drawn around the detected blob on the preview image before display

#### Scenario: No overlay when no detection
- **WHEN** no mosquito is detected
- **THEN** the preview SHALL show the raw camera frame with no bounding-box overlay

### Requirement: Proximity meter display
The system SHALL show a numeric or visual proximity readout (e.g., percentage or bar) that reflects the current proximity score, updated each frame.

#### Scenario: Proximity shown during detection
- **WHEN** a mosquito is detected with proximity score P
- **THEN** the UI SHALL display a value proportional to P (e.g., "Proximity: 42 %")

#### Scenario: Proximity cleared when no detection
- **WHEN** no detection is active
- **THEN** the proximity display SHALL show zero or "None"

### Requirement: Sensitivity slider control
The system SHALL provide a `ui.Slider` that maps to the detection sensitivity parameter (0.0–1.0), allowing the user to adjust sensitivity in real time without restarting the app.

#### Scenario: Slider adjusts sensitivity immediately
- **WHEN** the user moves the sensitivity slider
- **THEN** the new sensitivity value SHALL be passed to the detector for the next frame

#### Scenario: Default slider position
- **WHEN** the app starts
- **THEN** the slider SHALL be positioned at 0.5 (medium sensitivity)

### Requirement: Camera switch button
The system SHALL provide a button to toggle between the front and rear camera.

#### Scenario: Toggle camera
- **WHEN** the user taps the camera-switch button
- **THEN** the live preview SHALL switch to the other camera within 1 second

### Requirement: Single-screen layout
The system SHALL present all controls (preview, overlay, proximity meter, sensitivity slider, camera-switch button) on a single screen with no navigation hierarchy.

#### Scenario: All controls visible on launch
- **WHEN** the app launches and camera permission is granted
- **THEN** all UI controls SHALL be visible without any user navigation action
