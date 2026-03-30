## ADDED Requirements

### Requirement: Apply maximum zoom to camera track
After a camera stream is obtained, the system SHALL query the video track's zoom capability via `track.getCapabilities()` and, if a `zoom` range is reported, apply `track.applyConstraints({ advanced: [{ zoom: capabilities.zoom.max }] })` without blocking the stream return.

#### Scenario: Device supports zoom
- **WHEN** `track.getCapabilities().zoom` returns a range with a `max` value greater than 1
- **THEN** the system SHALL call `track.applyConstraints({ advanced: [{ zoom: max }] })` and the camera SHALL display the zoomed-in view within one frame

#### Scenario: Device does not support zoom
- **WHEN** `track.getCapabilities()` returns an object with no `zoom` property, OR `zoom.max` is undefined
- **THEN** the system SHALL silently skip the zoom step and the stream SHALL proceed normally at default zoom

#### Scenario: applyConstraints rejects
- **WHEN** `track.applyConstraints` rejects with any error
- **THEN** the system SHALL swallow the error silently and SHALL NOT display an error to the user; detection SHALL continue normally

### Requirement: Reapply max zoom after camera flip
When the user switches between front and rear cameras, the system SHALL attempt to apply maximum zoom to the new camera track using the same `applyMaxZoom` function.

#### Scenario: Camera flipped to rear
- **WHEN** the user taps the Flip Camera button and the rear camera stream starts
- **THEN** the system SHALL attempt to apply maximum zoom to the new rear camera track

#### Scenario: Camera flipped to front
- **WHEN** the user taps the Flip Camera button and the front camera stream starts
- **THEN** the system SHALL attempt to apply maximum zoom to the new front camera track (which may have a different or no zoom capability than the rear)
