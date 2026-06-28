# Task 025: Build Full Multi-Replay Spatial Timeline

Status: completed
Execution mode: autonomous
Project stage: Multi-replay spatial dataset
Related experiment: full multi-replay spatial timeline
Priority: high
Depends on: task 020 pre-geometry pipeline completed; task 022 structural topology completed; task 023 lane-distance mapping completed; gate `lane_distance_mapping_ready`
Unlocked by: `output/replays/lane-axis-distance-mapping-summary.json` gate equals `lane_distance_mapping_ready`
Blocks: frozen occupancy generalization testing

## Objective

Build replay-isolated full spatial timelines for replays 002, 003, and 004 using shared structural geometry and neutral physical lane axes.

## Context to read

- `AGENTS.md`
- `docs/PROJECT_STATE.md`
- `docs/DATA_DICTIONARY.md`
- `docs/DECISIONS.md`
- completed tasks 020, 022, and 023
- `reports/pre-geometry-replay-pipeline.md`
- `reports/structural-lane-axis-topology.md`
- `reports/lane-axis-distance-mapping.md`
- `output/replay-lane-axis-topology-profile.json`
- `output/replay-lane-axis-topology-gate.json`
- `output/replays/lane-axis-distance-mapping-summary.json`
- `scripts/parameterize-structural-lane-distance-mapping.js`
- replay 001 canonical timeline and movement scripts for schema compatibility only
- replay-isolated outputs for 002-004

## Work requested

- Produce deterministic player-second spatial timelines for replays 002, 003, and 004.
- Use the most reliable player/controller/pawn coordinate source available from the parser.
- Compute lane-axis projection, structural region descriptors, movement features, and data-quality audits.
- Compare timeline quality across replays before any future frozen-model application.

## Constraints

- Do not classify stable lane occupancy.
- Do not detect transitions.
- Do not tune thresholds.
- Do not process replay 005.
- Do not overwrite replay 001 outputs or previous task outputs.
- Do not use occupancy conclusions except to understand input schemas.

## Inputs

Replay files 002-004, approved lane-axis topology profile, replay-isolated pre-geometry and lane-distance outputs, and replay 001 canonical timeline/movement scripts for schema compatibility.

## Outputs

- `output/replays/replay_002/full-spatial-timeline.json`
- `output/replays/replay_002/spatial-data-quality.json`
- `output/replays/replay_003/full-spatial-timeline.json`
- `output/replays/replay_003/spatial-data-quality.json`
- `output/replays/replay_004/full-spatial-timeline.json`
- `output/replays/replay_004/spatial-data-quality.json`
- `output/replays/multi-replay-spatial-comparison.json`
- `output/replays/full-spatial-timeline-gate.json`
- `reports/full-multi-replay-spatial-timeline.md`

## Acceptance criteria

- Replays 002, 003, and 004 have replay-isolated spatial timelines.
- Each timeline reconciles 12 players where parser data supports it.
- Timeline rows are chronologically ordered and have unique player-time keys.
- Lane projections are finite for valid coordinates.
- Missing/stale coordinate behavior is explicitly reported.
- Replay 005 remains untouched.
- Exactly one documented gate is produced.

## Required validation

- ESLint on new or modified JavaScript.
- JSON or JSONL parse validation.
- Output-size checks.
- Deterministic-repeatability check.
- Unique player-time key check.
- Chronological ordering check.
- 12-player coverage check.
- Finite projection check.
- Coordinate-age validation.
- Cross-replay schema equality check.
- Task queue validation.
- Git checks confirming replay files, previous outputs, and replay 005 were not modified.

## Gate result

Allowed results:

- `full_spatial_timeline_ready`
- `full_spatial_timeline_ready_with_limitations`
- `full_spatial_timeline_incomparable`
- `full_spatial_timeline_blocked`

## Documentation updates

Update `reports/latest.md` and `docs/PROJECT_STATE.md` only when justified.

## Git scope

Use explicit staging only. Commit separately from any future frozen-model task.

## Expected report

Summarize extraction method, temporal resolution, player reconciliation, coordinate-source behavior, data-quality metrics, projection quality, movement derivation, structural-region derivation, cross-replay comparison, limitations, allowed downstream use, prohibited conclusions, and gate result.

## Stop conditions

Stop if any replay cannot produce a trustworthy canonical spatial timeline. If the gate is ready or ready with limitations, create and promote a separate frozen-model task, but do not execute it unless it is fully specified and safe under the queue rules.
