# Replay 009 Independent Landmark Coordinate Acquisition

Task: `071-acquire-replay-009-independent-landmark-coordinates`

Gate: `replay_009_independent_landmark_coordinates_missing`

## Summary

Task 071 attempted to acquire independent map-side coordinates for replay-009 landmarks after Task 070 found no coordinate-bearing map landmarks in local package metadata.

The text annotation packet was ingested successfully, but the five user-supplied map/minimap images were not present as local files. Therefore no pixel coordinates, normalized map-image coordinates, accepted landmarks, reserved validation anchor, or transform-ready landmark set could be produced.

## Result

- Image files found: 0.
- Map landmarks measured: 0.
- Accepted landmarks: 0.
- Reserved future validation anchor: none.
- Modded/standard map comparison: not evaluable.
- Human/video correlations completed: 0.

The participant annotations remain useful for search guidance and hypothesis rejection, but they are not exact geometric measurements.

## Required User Action

Place the five supplied images under:

```text
.local/spatial-inputs/replay-009-user-maps/
```

with semantic filenames:

```text
replay-009-custom-map-dense.jpg
replay-009-custom-map-reduced.jpg
replay-009-custom-map-clean.jpg
replay-009-standard-minimap.jpg
replay-009-urn-spawn-diagram.png
```

After those files are available locally, a future task can measure map-image pixel coordinates and pre-register fit/validation anchors without fitting a transform in the acquisition step.

## Boundaries

Task 071 did not fit a transform, emit lanes, emit regions, compute objective proximity, apply mechanics, or perform macro interpretation.

Replay 005 and bot fixtures 006-008 were not read or processed.
