# Task 023: Parameterize Structural Lane Distance Mapping

Status: completed
Execution mode: autonomous
Project stage: Multi-replay geometry
Related experiment: structural lane-distance mapping
Priority: high
Depends on: task 022 completed with gate `structural_topology_ready_for_lane_mapping`
Unlocked by: `output/replay-lane-axis-topology-gate.json` gate equals `structural_topology_ready_for_lane_mapping`
Blocks: geometry-dependent movement interpretation

## Objective

Use the approved structural lane-axis topology profile to compute geometric lane-distance features for replays 002, 003, and 004 in isolated output directories.

## Context to read

- `AGENTS.md`
- `docs/PROJECT_STATE.md`
- this task file
- `output/replay-lane-axis-topology-profile.json`
- `output/replay-lane-axis-topology-gate.json`
- `output/replays/replay_002/pre-geometry-pipeline.json`
- `output/replays/replay_003/pre-geometry-pipeline.json`
- `output/replays/replay_004/pre-geometry-pipeline.json`

## Work requested

- Process replay 002 first as a smoke test.
- If replay 002 passes, process replay 003 and replay 004.
- For every raw movement coordinate row, compute distance to each physical lane axis, nearest and second-nearest physical lane, separation margin, normalized progress along lane, distance to lane endpoints, and projection quality.
- Produce isolated outputs under `output/replays/replay_002/`, `output/replays/replay_003/`, and `output/replays/replay_004/`.

## Constraints

- Do not classify stable occupancy.
- Do not detect transitions.
- Do not process replay 005.
- Do not use player movement density to modify axes.
- Do not alter the approved topology profile.
- Do not run combat, objective-lifecycle, economy, macro, or strategic analysis.

## Inputs

Approved topology profile and pre-geometry raw movement coordinate samples for replays 002-004.

## Outputs

- `output/replays/replay_002/lane-axis-distance-mapping.json`
- `output/replays/replay_003/lane-axis-distance-mapping.json`
- `output/replays/replay_004/lane-axis-distance-mapping.json`
- `output/replays/lane-axis-distance-mapping-summary.json`
- `reports/lane-axis-distance-mapping.md`

## Acceptance criteria

- Replay 002 is processed first and passes before replay 003/004 are processed.
- Outputs contain geometric projection features only.
- Replay 005 remains untouched.
- No occupancy labels, transition candidates, or semantic lane-color claims are produced.

## Required validation

- ESLint on new or modified JavaScript.
- JSON parsing for new outputs.
- Output-size checks.
- Deterministic-repeatability checks.
- Replay 002 smoke-test pass recorded.
- Task queue validation.
- Git checks confirming replay files, prior outputs, and replay 005 were not modified.

## Gate result

Allowed results:

- `lane_distance_mapping_ready`
- `lane_distance_mapping_blocked`

## Documentation updates

Update `reports/latest.md` and `docs/PROJECT_STATE.md` only when justified.

## Git scope

Use explicit staging only. Commit separately from task 022.

## Expected report

Summarize processed replays, row counts, lane-distance feature coverage, smoke-test result, limitations, gate result, and prohibited downstream uses.

## Stop conditions

Stop if replay 002 fails, if replay 005 would be required, or after producing lane-distance mapping outputs. Do not start occupancy or transition detection.
