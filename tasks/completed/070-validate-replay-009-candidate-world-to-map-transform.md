# Task 070: Validate Replay 009 Candidate World-To-Map Transform

Status: completed

Unlocked by: explicit user authorization after Task 069 gate `replay_009_map_geometry_inputs_ready_with_limitations`

Blocked by: transform validation requires explicit authorization after Task 069 gate `replay_009_map_geometry_inputs_ready_with_limitations`

Depends on:

- Task 069 gate: `replay_009_map_geometry_inputs_ready_with_limitations`

## Objective

Validate whether the Task 069 acquired geometry candidates and replay-009 landmark candidates can support a bounded world-coordinate-to-map transform.

This task may inspect local-only geometry assets and compact Task 069 metadata, but it must not treat the current installed map as authoritative for build `23916427` without direct compatibility evidence.

## Scope

Replay scope:

- `replay_009`

Do not process or inspect:

- replay 005;
- bot fixtures 006, 007, or 008.

## Constraints

- Do not fit a production transform until candidate anchors are independently accepted.
- Do not emit lane labels, region membership, objective proximity, rotations, pressure, fights, macro interpretation, or mechanic effects.
- Do not commit proprietary game assets, VPK files, full extracted maps, screenshots, video frames, or uncleared map images.
- Preserve all build/version and licensing limitations from Task 069.

## Required Inputs

- `output/replay-009-spatial-inputs/input-package-manifest.json`
- `output/replay-009-spatial-inputs/geometry-candidate-inventory.json`
- `output/replay-009-spatial-inputs/calibration-anchor-inventory.json`
- local-only geometry candidates listed by Task 069, when available

## Acceptance Gate

Produce exactly one:

- `replay_009_candidate_transform_validated`
- `replay_009_candidate_transform_validated_with_limitations`
- `replay_009_candidate_transform_not_ready`
- `replay_009_candidate_transform_blocked`

Use `validated` only when build/map compatibility is sufficiently supported, a transform is fitted from independent accepted anchors, and at least one independent validation anchor is held out and passes bounded residual checks.

## Stop Conditions

- no license-safe or local-only extraction path is available;
- no independent map coordinates can be acquired for replay landmarks;
- candidate geometry cannot be tied to replay 009 well enough even for bounded validation;
- any step would require replay 005 or bot fixture processing.
