## ADDED Requirements

### Requirement: Looping mosquito-buzz audio playback
The system SHALL play a looping mosquito-buzz audio clip continuously while at least one mosquito detection is active, and SHALL stop playback when no detection is present.

#### Scenario: Detection starts — audio begins
- **WHEN** a mosquito is detected for the first time (transitioning from no-detection to detection)
- **THEN** the audio player SHALL begin looping the buzz clip within 200 ms

#### Scenario: Detection ends — audio stops
- **WHEN** no mosquito is detected for more than 1 second (detection timeout)
- **THEN** the audio player SHALL stop playback and reset to silence

#### Scenario: Continuous detection — uninterrupted playback
- **WHEN** a mosquito is continuously detected across multiple frames
- **THEN** the audio SHALL play without interruption or restart

### Requirement: Proximity-proportional volume scaling
The system SHALL set the audio player's volume proportionally to the current proximity score (volume = proximity score), so that closer detections produce louder audio.

#### Scenario: Maximum volume at maximum proximity
- **WHEN** the proximity score is 1.0
- **THEN** the audio player volume SHALL be set to 1.0 (maximum)

#### Scenario: Low volume at low proximity
- **WHEN** the proximity score is 0.1
- **THEN** the audio player volume SHALL be set to 0.1

#### Scenario: Volume updates each detection cycle
- **WHEN** the proximity score changes between frames
- **THEN** the audio player volume SHALL be updated within the same detection cycle (≤100 ms)

### Requirement: Bundled buzz audio asset
The system SHALL include a short (≤2 s) looping mosquito-buzz audio file (`.wav` or `.mp3`) as a project asset, OR generate an equivalent synthetic buzz programmatically, so that no external network fetch is required.

#### Scenario: Audio asset loads on startup
- **WHEN** the app initializes
- **THEN** the audio asset SHALL be loaded into the player without error

#### Scenario: No network required
- **WHEN** the device is in airplane mode
- **THEN** the audio system SHALL function identically to when network is available
