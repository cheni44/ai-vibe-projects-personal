## ADDED Requirements

### Requirement: Single-page layout with start/stop control
The system SHALL render all controls on a single HTML page with no navigation. A "Start" button SHALL be prominently displayed before camera access is granted; once the stream is active the button SHALL change to "Stop".

#### Scenario: Start button visible on page load
- **WHEN** the page loads
- **THEN** a "Start" button SHALL be visible and all other controls SHALL be inactive or hidden until the stream is running

#### Scenario: Stop button appears while running
- **WHEN** the camera stream is active
- **THEN** the start button SHALL read "Stop" and tapping it SHALL halt the stream and audio

### Requirement: Live camera preview with bounding-box overlay
The system SHALL display the live camera feed via a `<video>` element with a transparent `<canvas>` overlay (same dimensions, `position: absolute` on top). Each detection cycle SHALL clear the overlay and draw red rectangles around all detected blobs in original-frame coordinates.

#### Scenario: Bounding box drawn on detection
- **WHEN** a mosquito is detected in a frame
- **THEN** a red rectangle SHALL be drawn on the overlay canvas at the scaled bounding-box position within the same animation frame

#### Scenario: Overlay cleared when no detection
- **WHEN** no mosquito is detected
- **THEN** the overlay canvas SHALL be cleared (no stale rectangles)

### Requirement: Proximity meter display
The system SHALL display a numeric proximity readout (e.g., "Proximity: 42 %") and a visual progress bar that reflect the current proximity score, updated each detection cycle.

#### Scenario: Proximity shown with colour coding
- **WHEN** a mosquito is detected with proximity score P
- **THEN** the readout SHALL show `"Proximity: ${Math.round(P * 100)} %"` and the bar colour SHALL be green (P < 0.4), yellow (0.4 ≤ P < 0.7), or red (P ≥ 0.7)

#### Scenario: Proximity resets to zero when no detection
- **WHEN** no mosquito is detected
- **THEN** the readout SHALL show "Proximity: —" and the bar SHALL be empty

### Requirement: Sensitivity slider
The system SHALL provide an `<input type="range" min="0" max="1" step="0.01">` slider defaulting to 0.5 that updates the detection sensitivity in real time on each `input` event.

#### Scenario: Slider default value
- **WHEN** the page loads
- **THEN** the sensitivity slider SHALL be positioned at 0.5

#### Scenario: Slider change updates detection immediately
- **WHEN** the user moves the slider while the stream is running
- **THEN** the new sensitivity value SHALL be used for the next detection cycle

### Requirement: Camera flip button
The system SHALL provide a "🔄 Flip Camera" button that switches between `facingMode: 'environment'` and `facingMode: 'user'` and resets the detector's motion-filter state.

#### Scenario: Flip switches camera
- **WHEN** the user taps "🔄 Flip Camera"
- **THEN** the video stream SHALL switch to the other camera within 1 second and the overlay SHALL clear

### Requirement: Responsive layout for mobile
The system SHALL use responsive CSS so the layout is usable on both portrait phone screens (≥ 320 px wide) and landscape tablet/desktop screens without horizontal scrolling.

#### Scenario: Portrait phone renders without overflow
- **WHEN** the page is viewed on a 375 × 667 px viewport (iPhone SE)
- **THEN** all controls SHALL be visible without horizontal scrolling
