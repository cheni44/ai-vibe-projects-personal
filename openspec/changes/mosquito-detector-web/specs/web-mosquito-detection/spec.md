## ADDED Requirements

### Requirement: Per-frame grayscale threshold preprocessing
The system SHALL preprocess each captured frame by converting the RGBA pixel array to grayscale (luminance formula) and applying a fixed dark threshold (pixels with grayscale value < 80 are foreground), producing a flat boolean array of size PROC_W × PROC_H.

#### Scenario: Uniform bright frame produces empty mask
- **WHEN** all pixels in the frame have grayscale value ≥ 80
- **THEN** the foreground mask SHALL contain zero true pixels

#### Scenario: Dark region produces foreground pixels
- **WHEN** a region of the frame has grayscale value < 80
- **THEN** the corresponding positions in the foreground mask SHALL be true

### Requirement: BFS connected-component blob detection
The system SHALL find connected foreground regions using a breadth-first-search flood-fill on the boolean mask and SHALL return for each region: its bounding box (x, y, w, h), pixel area, centroid (cx, cy), and aspect ratio (w/h).

#### Scenario: No foreground pixels produces no blobs
- **WHEN** the foreground mask is all-false
- **THEN** the blob list SHALL be empty

#### Scenario: Isolated dark region produces one blob
- **WHEN** a single connected dark region exists in the mask
- **THEN** exactly one blob SHALL be returned with correct bounding box and area

### Requirement: Size and aspect-ratio filter
The system SHALL reject blobs whose area or aspect ratio falls outside sensitivity-scaled thresholds: at sensitivity 0.5, minimum area is 4 px² (at 96×72 resolution) and aspect ratio must be between 0.15 and 12.0.

#### Scenario: High sensitivity accepts smaller blobs
- **WHEN** sensitivity is set to 0.8 or higher
- **THEN** blobs with area ≥ 2 px² SHALL pass the size filter

#### Scenario: Low sensitivity rejects small blobs
- **WHEN** sensitivity is set to 0.2 or lower
- **THEN** blobs with area < 8 px² SHALL be rejected

### Requirement: Inter-frame motion filter
The system SHALL require that a detected blob's centroid has moved at least 1.5 px from its nearest match in the previous frame before confirming it as a mosquito detection. Blobs matching a static previous-frame position SHALL be rejected.

#### Scenario: Moving blob confirmed
- **WHEN** a blob's centroid moves more than 1.5 px between frames
- **THEN** the blob SHALL be included in the detection result

#### Scenario: Static blob rejected
- **WHEN** a blob's centroid remains at the same position across frames
- **THEN** the blob SHALL NOT be reported as a detection

### Requirement: Proximity score from bounding-box area
The system SHALL compute a normalised proximity score as `min(1.0, blobArea / frameArea / 0.02)`, where frameArea = PROC_W × PROC_H, so that a blob occupying 2 % of the frame returns a score of 1.0.

#### Scenario: Large blob yields proximity 1.0
- **WHEN** blob area ≥ 2 % of frame area
- **THEN** proximity score SHALL be clamped to 1.0

#### Scenario: Small blob yields low proximity
- **WHEN** blob area < 0.1 % of frame area
- **THEN** proximity score SHALL be ≤ 0.1
