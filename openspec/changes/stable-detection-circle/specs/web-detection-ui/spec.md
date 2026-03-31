## MODIFIED Requirements

### Requirement: Live camera preview with bounding-box overlay
The system SHALL display the live camera feed via a `<video>` element with a transparent `<canvas>` overlay (same dimensions, `position: absolute` on top). Each animation frame SHALL clear the overlay. For each **stable detection** (blob continuously present ≥ 1 000 ms), the system SHALL draw a red circle centred on the blob centroid with radius `max(bbox.w, bbox.h) / 2 * 1.3`, scaled to display resolution. Transient detections (< 1 000 ms) SHALL produce no visual indicator.

#### Scenario: Circle drawn for stable detection
- **WHEN** a blob has been continuously detected for ≥ 1 000 ms
- **THEN** a red circle SHALL be drawn on the overlay canvas centred on the blob centroid within the same animation frame

#### Scenario: No overlay for transient detection
- **WHEN** a blob has been detected for < 1 000 ms
- **THEN** NO rectangle or circle SHALL be drawn on the overlay canvas

#### Scenario: Overlay cleared when no stable detection
- **WHEN** no stable blob is present
- **THEN** the overlay canvas SHALL be cleared (no stale circles or rectangles)

## REMOVED Requirements

### Requirement: Bounding box drawn on detection
**Reason**: Replaced by circle-on-stable-detection to reduce false-positive visual noise. Transient detections no longer produce any overlay.
**Migration**: Remove `ctx.strokeRect(...)` call in `renderOverlay`; replace with `ctx.arc(...)` gated on stable-detection status.
