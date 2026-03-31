## MODIFIED Requirements

### Requirement: Adaptive per-frame luminance threshold
The system SHALL compute a per-frame grayscale threshold using Otsu's algorithm on the frame's luminance histogram, clamped to the range [30, 150], replacing the previous fixed threshold of 80.

#### Scenario: Normal lighting
- **WHEN** the frame has a bimodal histogram (background + foreground objects)
- **THEN** Otsu's threshold SHALL separate background from foreground pixels more accurately than a fixed value

#### Scenario: Low-contrast frame
- **WHEN** Otsu's computed threshold falls below 30 or above 150
- **THEN** the system SHALL clamp it to [30, 150] to prevent degenerate all-foreground or all-background masks

### Requirement: Pixel-level frame-difference motion detection
The system SHALL replace centroid-distance motion filtering with pixel-level absolute frame differencing. A pixel is classified as "moving" when `|currentGray - prevGray| >= DIFF_THRESHOLD` (15). BFS blob detection SHALL run only on pixels that are both in the foreground mask AND in the motion mask. The previous grayscale frame SHALL be stored in a `Float32Array` as `prevGrayFrame` in module state.

#### Scenario: Static object in frame
- **WHEN** a dark object is present but stationary across two consecutive frames
- **THEN** its pixels SHALL produce a near-zero diff and SHALL NOT be included in detections

#### Scenario: Moving dark object
- **WHEN** a dark object moves between consecutive frames
- **THEN** its pixels SHALL exceed the diff threshold and the resulting blob SHALL be included in detections

#### Scenario: First frame after start
- **WHEN** `prevGrayFrame` is null (first frame after Start or Flip)
- **THEN** the system SHALL return zero detections and seed `prevGrayFrame` for the next frame

#### Scenario: Camera shake / sudden pan
- **WHEN** the entire camera image shifts due to hand movement
- **THEN** the uniform diff across the frame SHALL NOT produce any single localized blob meeting the size criteria, minimising false positives

### Requirement: Processing resolution 128×96
The system SHALL process frames at 128×96 pixels (increased from 96×72), providing greater blob detail for small targets.

#### Scenario: Frame captured at processing resolution
- **WHEN** a video frame is drawn to the offscreen canvas
- **THEN** it SHALL be scaled to 128×96 px before pixel analysis

### Requirement: Tighter blob shape filter
The system SHALL filter blobs with an aspect ratio outside [0.2, 7.0] (narrowed from [0.15, 12.0]), reducing elongated artefacts from edge noise.

#### Scenario: Blob within aspect ratio range
- **WHEN** a blob has aspect ratio between 0.2 and 7.0
- **THEN** it SHALL pass the shape filter and be eligible for detection

#### Scenario: Blob outside aspect ratio range
- **WHEN** a blob has aspect ratio below 0.2 or above 7.0
- **THEN** it SHALL be rejected by the shape filter
