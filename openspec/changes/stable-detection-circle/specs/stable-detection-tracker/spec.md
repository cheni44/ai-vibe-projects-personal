## ADDED Requirements

### Requirement: Blob lifetime tracking across frames
The system SHALL maintain a `Map` (`stableTracker`) keyed by a grid-quantised centroid string (`"${Math.round(cx/8)},${Math.round(cy/8)}"`) that stores `{ firstSeenMs, lastSeenMs, blob }` for each currently tracked blob. The map SHALL be updated every animation frame after detection.

#### Scenario: New blob enters tracker
- **WHEN** a detected blob's grid key is not present in `stableTracker`
- **THEN** the system SHALL insert a new entry with `firstSeenMs = Date.now()` and `lastSeenMs = Date.now()`

#### Scenario: Existing blob updates tracker
- **WHEN** a detected blob's grid key already exists in `stableTracker`
- **THEN** the system SHALL update `lastSeenMs = Date.now()` and update `blob` to the latest detection data

#### Scenario: Missing blob is evicted
- **WHEN** `Date.now() - entry.lastSeenMs > 500` for any tracker entry
- **THEN** that entry SHALL be deleted from `stableTracker`

### Requirement: Stable blob promotion after 1 second
The system SHALL consider a tracker entry "stable" when `Date.now() - entry.firstSeenMs >= 1000` ms. Only stable blobs are eligible for circle rendering and audio triggering.

#### Scenario: Blob promoted to stable after 1 s
- **WHEN** a blob has been continuously tracked for ≥ 1 000 ms
- **THEN** `getStableDetections()` SHALL include it in its return value

#### Scenario: Blob not stable before 1 s
- **WHEN** a blob has been tracked for < 1 000 ms
- **THEN** `getStableDetections()` SHALL NOT include it

### Requirement: Tracker reset on camera stop or flip
The system SHALL clear `stableTracker` (and `prevBlobs`) whenever the camera is stopped or the camera is flipped, to prevent stale state from persisting across stream restarts.

#### Scenario: Tracker cleared on stop
- **WHEN** the user clicks "Stop"
- **THEN** `stableTracker` SHALL be empty after the stop sequence completes

#### Scenario: Tracker cleared on flip
- **WHEN** the user clicks "🔄 Flip Camera"
- **THEN** `stableTracker` SHALL be empty before the new stream starts
