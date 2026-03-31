## MODIFIED Requirements

### Requirement: Proximity-proportional gain
The system SHALL set the proximity `GainNode`'s gain value to the current proximity score (0.0–1.0) each detection cycle **only when at least one stable detection (blob present ≥ 1 000 ms) exists**. When no stable detection is present, the system SHALL treat the proximity score as 0.0 regardless of any transient detections.

#### Scenario: Audio plays only on stable detection
- **WHEN** a blob has been continuously detected for ≥ 1 000 ms and has proximity score P > 0
- **THEN** `updateAudio(alert, P)` SHALL be called and audio SHALL play at volume P

#### Scenario: Audio silent for transient detection
- **WHEN** a blob is detected but has been present for < 1 000 ms
- **THEN** `updateAudio(alert, 0)` SHALL be called (or the existing silence timeout shall apply) and NO audio SHALL play

#### Scenario: Zero proximity produces silence
- **WHEN** no stable blob is present for more than 1 second
- **THEN** the proximity gain SHALL be set to 0.0, producing silence

#### Scenario: Maximum proximity produces maximum volume
- **WHEN** a stable detection has proximity score = 1.0
- **THEN** the proximity gain SHALL be set to 1.0
