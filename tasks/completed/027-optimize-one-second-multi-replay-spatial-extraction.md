# Task 027: Optimize One-Second Multi-Replay Spatial Extraction

Status: completed
Execution mode: autonomous
Project stage: Multi-replay spatial data pipeline
Related experiment: one-second spatial extraction
Priority: high
Depends on: task 025 completed; task 026 completed; replay 005 status `not_ready_resolution_confounded`
Unlocked by: task 026 gate equals `frozen_occupancy_generalization_ready_for_review`
Blocks: resolution-controlled frozen occupancy comparison

## Objective

Remove the temporal-resolution confound by engineering a scalable one-second spatial extraction pipeline for replays 001-004, and formalize the currently supported non-semantic point-level spatial evidence layer.

## Context to read

- `AGENTS.md`
- `docs/PROJECT_STATE.md`
- `docs/DECISIONS.md`
- `reports/full-multi-replay-spatial-timeline.md`
- `reports/frozen-occupancy-generalization.md`
- `scripts/build-full-multi-replay-spatial-timeline.js`
- `scripts/apply-frozen-occupancy-generalization.js`
- `output/replays/full-spatial-timeline-gate.json`
- `output/replays/frozen-occupancy-generalization-gate.json`
- `output/replay-lane-axis-topology-profile.json`
- `output/replays/replay_002/full-spatial-timeline.rows.jsonl`
- `output/replays/replay_003/full-spatial-timeline.rows.jsonl`
- `output/replays/replay_004/full-spatial-timeline.rows.jsonl`

## Work requested

- Profile a one-second extraction attempt on replay 002 with instrumentation.
- Implement scoped performance optimizations without changing spatial semantics.
- Produce one row per stable player per canonical game second for replays 001-004 when feasible.
- Store replay-isolated one-second rows as sharded JSONL with manifests and quality summaries.
- Compare one-second rows against existing five-second rows at matching timestamps.
- Run deterministic repeatability for replay 002.
- Create the descriptive point-level spatial-evidence schema and report.
- Produce a gate for one-second extraction readiness.

## Constraints

- Do not process replay 005.
- Do not detect transitions.
- Do not tune, recalibrate, or change frozen model parameters.
- Do not reduce the one-second temporal resolution.
- Do not silently omit players or seconds.
- Do not approximate lane projection with a different algorithm.
- Do not alter the canonical clock.
- Do not interpolate missing coordinates.
- Keep individual output files below 10 MiB.

## Inputs

Replay files 001-004, shared structural lane-axis topology profile, existing five-second spatial timelines for comparison, and frozen generalization outputs.

## Outputs

- `output/replays/one-second-spatial-profile.json`
- `output/replays/one-second-spatial-comparison.json`
- `output/replays/one-second-spatial-gate.json`
- `output/replays/descriptive-spatial-evidence-schema.json`
- replay-isolated one-second manifests, quality files, and sharded JSONL rows for replays 001-004 when successful
- `reports/one-second-multi-replay-spatial-extraction.md`
- `reports/descriptive-spatial-evidence-layer.md`

## Acceptance criteria

- Profiling identifies the largest measured time and memory contributors.
- Optimizations are implemented only where measurements justify them.
- Every completed replay has unique player-time keys, chronological rows, 12-player reconciliation, finite lane projections for direct coordinates, and file hashes.
- Five-second alignment checks report exact mismatch counts and numeric tolerances.
- Replay 002 repeatability confirms identical hashes and quality metrics.
- Replay 005 protection is explicitly validated.
- The descriptive evidence layer defines only non-semantic point evidence classes.

## Required validation

- ESLint on new or modified JavaScript.
- JSON and JSONL parse validation.
- Output-size checks.
- Shard hash validation.
- Unique player-time key checks.
- Chronological ordering checks.
- 12-player reconciliation checks.
- Finite projection checks.
- One-second-to-five-second alignment checks.
- Deterministic replay 002 repeat.
- Replay 005 protection check.
- Task queue validation.
- Git verification that `.dem` files and prior outputs were not modified.

## Gate result

Allowed results:

- `one_second_spatial_ready`
- `one_second_spatial_ready_with_limitations`
- `one_second_spatial_performance_blocked`
- `one_second_spatial_semantics_incompatible`

## Documentation updates

Update `reports/latest.md`. Update `docs/PROJECT_STATE.md` and `docs/DECISIONS.md` only when justified by the gate.

## Git scope

Use explicit staging only. Commit this task separately from any later frozen one-second model comparison.

## Expected report

Summarize timeout profiling, optimizations, replay processing status, row and shard counts, runtime and memory, direct/missing coverage, five-second alignment, repeatability, descriptive evidence classes, gate result, and remaining limitations.

## Stop conditions

Stop after producing the one-second extraction gate and descriptive evidence layer. Create a separate pending resolution-comparison task only when the one-second gate is ready or ready with limitations; do not execute it in this task unless it already exists and queue policy permits it.
