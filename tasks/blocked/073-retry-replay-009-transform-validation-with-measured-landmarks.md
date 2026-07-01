# Task 073: Retry Replay 009 Transform Validation With Measured Landmarks

Execution mode: autonomous

Status: blocked

Unlocked by: `replay_009_independent_landmark_coordinates_ready_with_limitations`

## Blocking Gate

Requires Task 072 gate:

```text
replay_009_independent_landmark_coordinates_ready
```

or:

```text
replay_009_independent_landmark_coordinates_ready_with_limitations
```

## Context

Task 070 completed with gate `replay_009_candidate_transform_not_ready` because no independent map-side coordinates were available.

Task 072 measures user-supplied map/minimap landmark pixel coordinates and preregisters a fit/validation anchor plan. This task may retry transform validation only after those measurements exist and the Task 072 gate permits it.

## Objective

Use Task 072 measured map-side landmark coordinates to retry a bounded replay-009 world-coordinate-to-map-image transform validation.

## Required Inputs

- `output/replay-009-landmark-measurement/measured-landmarks.json`
- `output/replay-009-landmark-measurement/replay-landmark-correspondence-candidates.json`
- `output/replay-009-landmark-measurement/fit-validation-anchor-plan.json`
- `output/replay-009-landmark-measurement/measurement-gate.json`
- Replay-side landmark/entity evidence from Tasks 062-065.

## Constraints

- Do not rewrite Task 070 historical outputs.
- Do not fit a transform unless correspondences are identity-grounded before residual inspection.
- Do not use Spirit Urn candidates, player positions, lane-path density, symmetry-generated points, or deletion locations as anchors.
- Preserve the held-out validation split from Task 072 unless a documented invalidation requires blocking.
- Do not emit lane membership, regions, objective proximity, rotations, pressure, fights, macro interpretation, or mechanic effects.
- Do not process replay 005.
- Do not process replays 006-008.
- Do not commit source images or map assets.

## Acceptance Criteria

Produce a transform-validation decision with explicit fit anchors, held-out validation anchors, residual policy, topology checks when a model is fitted, build/source limitations, and a gate.
