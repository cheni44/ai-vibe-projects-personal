## ADDED Requirements

### Requirement: Per-frame mosquito blob detection
The system SHALL analyze each camera frame using image-processing heuristics (grayscale conversion, thresholding, blob detection) to identify candidate mosquito objects, filtering by blob size and aspect ratio.

#### Scenario: Mosquito present in frame
- **WHEN** a frame is received containing a small, dark, elongated moving object consistent with a mosquito
- **THEN** the detector SHALL return at least one detection result with a bounding box and confidence score

#### Scenario: No mosquito in frame
- **WHEN** a frame is received with no qualifying blob
- **THEN** the detector SHALL return an empty detection list

#### Scenario: Multiple candidates — dominant detection selected
- **WHEN** multiple qualifying blobs are detected in a single frame
- **THEN** the detector SHALL return the largest blob as the primary detection and MAY include secondary detections

### Requirement: Motion-based false-positive filtering
The system SHALL require detected blobs to exhibit inter-frame motion (pixel delta between consecutive frames) above a configurable minimum threshold before confirming a detection, to reduce false positives from static objects.

#### Scenario: Static blob rejected
- **WHEN** a qualifying blob appears in the same position for more than 3 consecutive frames
- **THEN** the system SHALL NOT report it as a mosquito detection

#### Scenario: Moving blob confirmed
- **WHEN** a qualifying blob moves at least `motion_threshold` pixels between frames
- **THEN** the system SHALL report it as a confirmed mosquito detection

### Requirement: Adjustable detection sensitivity
The system SHALL expose a `sensitivity` parameter (0.0–1.0) that scales the blob-size filter thresholds, allowing users to trade off false-positive rate against detection rate.

#### Scenario: High sensitivity detects smaller blobs
- **WHEN** sensitivity is set to a high value (≥0.7)
- **THEN** the detector SHALL match smaller blobs than at the default sensitivity

#### Scenario: Low sensitivity ignores small blobs
- **WHEN** sensitivity is set to a low value (≤0.3)
- **THEN** the detector SHALL only match larger, more prominent blobs

### Requirement: Proximity estimation from bounding-box area
The system SHALL compute a normalized proximity score (0.0 = far/absent, 1.0 = very close) for each detected mosquito based on the ratio of its bounding-box area to the total frame area, calibrated so that a blob occupying 2 % of the frame yields a score of 1.0.

#### Scenario: Large blob yields high proximity
- **WHEN** a detected blob's area is ≥2 % of the frame area
- **THEN** the proximity score SHALL be 1.0 (clamped)

#### Scenario: Small blob yields low proximity
- **WHEN** a detected blob's area is <0.1 % of the frame area
- **THEN** the proximity score SHALL be ≤0.1
