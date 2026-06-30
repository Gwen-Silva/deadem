# Task 069: Acquire Replay 009 Map Geometry And Calibration Inputs

Status: blocked

Unlocked by: replay_009_map_geometry_inputs_supplied

Blocked by: missing authoritative or calibratable map geometry inputs for replay 009

## Objective

Acquire the minimum geometry and calibration inputs needed to begin the selected spatial-foundation milestone from Task 068.

This is an acquisition task only. It must not project replay coordinates, classify regions, infer lanes, compute objective proximity, apply mechanic effects, or perform macro analysis.

## Required user-supplied or authorized inputs

Provide at least one of:

- authoritative map geometry or coordinate assets for the Deadlock map/version applicable to replay 009/build `23916427`;
- a high-quality map image plus documented coordinate anchors sufficient for calibration;
- controlled screenshots/video frames with known world-coordinate anchors and provenance;
- explicit authorization to acquire and cite a specific external map/asset source.

Every input must include provenance, license/usage notes when applicable, and whether it is believed to match replay 009's map/build.

## Constraints

- Do not process replay 005.
- Do not process bot fixtures 006-008.
- Do not assume current map geometry applies to build `23916427`.
- Do not use spawn clustering alone to choose orientation.
- Do not infer lane occupancy, objective contest, pressure, rotations, or decisions.

## Expected outputs

- map/geometry source inventory;
- provenance and license notes;
- calibration-anchor inventory;
- feasibility gate for transform validation.

## Acceptance gate

Produce exactly one:

- `replay_009_map_geometry_inputs_ready`
- `replay_009_map_geometry_inputs_ready_with_limitations`
- `replay_009_map_geometry_inputs_missing`
- `replay_009_map_geometry_inputs_blocked`
