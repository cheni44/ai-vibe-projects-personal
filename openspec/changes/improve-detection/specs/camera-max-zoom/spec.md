## MODIFIED Requirements

### Requirement: Apply maximum zoom to camera track
After a camera stream is obtained, the system SHALL query the video track's zoom capability via `track.getCapabilities()` and, if a `zoom` range is reported, apply `track.applyConstraints({ advanced: [{ zoom: Math.min(capabilities.zoom.max, OPTICAL_ZOOM_CAP) }] })` where `OPTICAL_ZOOM_CAP = 5`, without blocking the stream return.

#### Scenario: Device supports zoom below optical cap
- **WHEN** `track.getCapabilities().zoom.max` is less than or equal to `OPTICAL_ZOOM_CAP` (5)
- **THEN** the system SHALL apply `zoom.max` exactly (e.g., 2× on iPhone 17)

#### Scenario: Device reports zoom above optical cap
- **WHEN** `track.getCapabilities().zoom.max` exceeds `OPTICAL_ZOOM_CAP` (e.g., 10× on Android with digital zoom)
- **THEN** the system SHALL cap the applied zoom at `OPTICAL_ZOOM_CAP` (5×) to avoid degraded digital zoom

#### Scenario: Device does not support zoom
- **WHEN** `track.getCapabilities()` returns an object with no `zoom` property
- **THEN** the system SHALL silently skip the zoom step

#### Scenario: applyConstraints rejects
- **WHEN** `track.applyConstraints` rejects with any error
- **THEN** the system SHALL swallow the error silently and detection SHALL continue normally
