## ADDED Requirements

### Requirement: Web Audio API synthesised buzz oscillator
The system SHALL synthesise a mosquito-buzz sound programmatically using the Web Audio API: a sawtooth `OscillatorNode` at 600 Hz whose output passes through a `GainNode` (the proximity gain), then to a second `GainNode` modulated by a 150 Hz sine `OscillatorNode` to simulate wing-beat amplitude modulation, and finally to `AudioContext.destination`.

#### Scenario: AudioContext created on user gesture
- **WHEN** the user taps "Start" for the first time
- **THEN** an `AudioContext` SHALL be created and both oscillators SHALL be started, fulfilling browser autoplay policy

#### Scenario: No audio before user gesture
- **WHEN** the page loads before the user has interacted
- **THEN** NO audio SHALL play (AudioContext not yet created)

### Requirement: Proximity-proportional gain
The system SHALL set the proximity `GainNode`'s gain value to the current proximity score (0.0–1.0) each detection cycle, so that louder output corresponds to a closer detected mosquito.

#### Scenario: Zero proximity produces silence
- **WHEN** no mosquito is detected (proximity = 0.0) for more than 1 second
- **THEN** the proximity gain SHALL be set to 0.0, producing silence

#### Scenario: Maximum proximity produces maximum volume
- **WHEN** proximity score = 1.0
- **THEN** the proximity gain SHALL be set to 1.0

#### Scenario: Volume updates within the same animation frame
- **WHEN** proximity score changes between detection cycles
- **THEN** `gain.setTargetAtTime(score, ctx.currentTime, 0.05)` SHALL be called to smoothly interpolate the new volume within ~150 ms

### Requirement: Silence after detection timeout
The system SHALL fade the proximity gain to 0.0 after 1 second of continuous zero-proximity detections, using `gain.setTargetAtTime(0, ctx.currentTime, 0.3)` for a smooth fade-out.

#### Scenario: Audio fades out after timeout
- **WHEN** no detection has occurred for 1 000 ms
- **THEN** the gain SHALL smoothly reach 0.0 within 400 ms

#### Scenario: Audio resumes immediately on new detection
- **WHEN** a detection occurs after silence
- **THEN** gain SHALL begin rising within the current animation frame (≤ 16 ms)
