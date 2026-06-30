# Task 069: Acquire Replay 009 Map Geometry And Calibration Inputs

Status: completed

Unlocked by: replay_009_map_geometry_inputs_supplied

Blocked by: missing authoritative or calibratable map geometry inputs for replay 009

## Objective

Acquire the minimum geometry and calibration inputs needed to begin the selected spatial-foundation milestone from Task 068.

This is an acquisition task only. It must not project replay coordinates, classify regions, infer lanes, compute objective proximity, apply mechanic effects, or perform macro analysis.

Replay scope:

- replay: `replay_009`
- match: `91381179`
- build: `23916427`

Treat these as separate questions:

1. What map geometry or image can be obtained?
2. What version/build does it represent?
3. Can replay-009 world coordinates be anchored to it?
4. Is the evidence sufficient to attempt transform validation?

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

Create:

- `output/replay-009-spatial-inputs/local-source-inventory.json`
- `output/replay-009-spatial-inputs/external-source-inventory.json`
- `output/replay-009-spatial-inputs/map-version-chronology.json`
- `output/replay-009-spatial-inputs/geometry-candidate-inventory.json`
- `output/replay-009-spatial-inputs/calibration-anchor-inventory.json`
- `output/replay-009-spatial-inputs/calibration-feasibility.json`
- `output/replay-009-spatial-inputs/provenance-license-audit.json`
- `output/replay-009-spatial-inputs/input-package-manifest.json`
- `output/replay-009-spatial-inputs/acquisition-summary.json`
- `output/replay-009-spatial-inputs/acquisition-gate.json`
- `output/replay-009-spatial-inputs/README.md`
- `reports/replay-009-map-geometry-input-acquisition.md`

Required phases:

1. repository and workspace inventory;
2. installed-game asset discovery through Steam metadata when available;
3. external-source inventory;
4. map-change chronology;
5. candidate geometry representation assessment;
6. independent anchor discovery;
7. minimum calibration feasibility;
8. provenance and licensing audit;
9. bounded input package manifest.

Keep local-only assets under ignored local directories. Do not commit full game packages, VPK archives, proprietary map binaries, source replay files, videos, frames, uncleared copyrighted map images, absolute local paths, fitted transforms, lane definitions, or macro interpretations.

## Acceptance gate

Produce exactly one:

- `replay_009_map_geometry_inputs_ready`
- `replay_009_map_geometry_inputs_ready_with_limitations`
- `replay_009_map_geometry_inputs_missing`
- `replay_009_map_geometry_inputs_blocked`

Use `ready` only when map/build compatibility is strongly supported, geometry is usable, sufficient distributed anchors exist, at least one independent validation anchor can be reserved, and licensing permits the required workflow.

Use `ready_with_limitations` when transform experimentation can begin but version, anchor, or licensing limitations remain explicit.

Validation:

- source-inventory schema tests;
- hash and path normalization tests;
- provenance completeness tests;
- license-field completeness tests;
- chronology consistency tests;
- geometry-candidate tests;
- anchor evidence tests;
- anchor-independence tests;
- calibration-feasibility tests;
- no-transform-produced test;
- no-region/lane-output test;
- JSON validation;
- deterministic rerun;
- task queue validation;
- Markdown/link validation;
- ESLint when code changes exist;
- Git status validation.
