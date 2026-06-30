# Task 071: Acquire Replay 009 Independent Landmark Coordinates

Status: blocked

Unlocked by: explicit user authorization after Task 070 gate `replay_009_candidate_transform_not_ready`

Blocked by: missing independent map-side coordinates for replay-009 Mid Boss and Walker landmarks

Depends on:

- Task 070 gate: `replay_009_candidate_transform_not_ready`

## Objective

Acquire independent coordinate-bearing map landmarks for replay 009 so a later task can attempt a held-out world-to-map transform validation.

The task must produce map-side coordinates through a meaningfully separate evidence path from replay trajectories.

## Acceptable Inputs

At least one of:

- license-safe decoded local map entity origins for Mid Boss, Walker, Guardian, or fixed structure landmarks;
- controlled manual coordinate capture from a legal local map viewer or tool with documented coordinate system;
- versioned map/overview metadata with explicit landmark coordinates and provenance;
- independently annotated map image coordinates for accepted landmarks with documented source and version.

## Constraints

- Do not process replay 005.
- Do not process bot fixtures 006-008.
- Do not use player trajectories, lane density, symmetry, or residual minimization to invent coordinates.
- Do not commit VPK files, compiled map binaries, textures, screenshots, video frames, or uncleared map images.
- Do not fit a transform in this task.
- Do not emit lane labels, regions, objective proximity, mechanic effects, or macro interpretation.

## Acceptance Gate

Produce exactly one:

- `replay_009_independent_landmark_coordinates_ready`
- `replay_009_independent_landmark_coordinates_ready_with_limitations`
- `replay_009_independent_landmark_coordinates_missing`
- `replay_009_independent_landmark_coordinates_blocked`

Use `ready` only when at least four distributed accepted landmarks are available and at least one can be reserved for validation.
