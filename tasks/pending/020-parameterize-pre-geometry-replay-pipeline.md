# Task 020: Parameterize Pre-Geometry Replay Pipeline

Status: pending
Execution mode: autonomous
Project stage: Multi-replay datasets
Related experiment: pre-geometry replay pipeline
Priority: high
Depends on: task 019 completed with gate `build_map_compatibility_ready_for_pipeline_parameterization`
Unlocked by: shared schema fingerprint across replays and geometry-dependent stages gated separately
Blocks: geometry-profile validation and later multi-replay standardized dataset

## Objective

Create and execute a replay-isolated pre-geometry pipeline for replays 002, 003, and 004 only.

## Context to read

- `AGENTS.md`
- `docs/PROJECT_STATE.md`
- `tasks/pending/020-parameterize-pre-geometry-replay-pipeline.md`
- `data/replay-manifest.json`
- `output/replay-build-map-compatibility.json`
- `output/replay-processing-plan.json`
- scripts for experiments 01-10 and 12 only as needed for source field semantics

## Work requested

- Create a parameterized pre-geometry script or scripts that write under `output/replays/<replayId>/`.
- Execute first on `replay_002`.
- If replay 002 succeeds, execute the same safe pre-geometry pipeline on `replay_003` and `replay_004`.
- Compare structural data quality across replays.

## Constraints

- Do not process replay 005.
- Do not overwrite global replay 001 outputs.
- Do not run lane mapping, topology, spatial regions, occupancy, transition detection, combat, objective, economy, macro, or model recalibration.
- Raw movement coordinates may be extracted only as coordinates/trajectory evidence, not as region interpretation.
- Use explicit replay IDs and isolated output directories.

## Inputs

- `samples/partida_002.dem`
- `samples/partida_003.dem`
- `samples/partida_004.dem`
- replay manifest and compatibility outputs

## Outputs

- `output/replays/replay_002/pre-geometry-pipeline.json`
- `output/replays/replay_003/pre-geometry-pipeline.json`
- `output/replays/replay_004/pre-geometry-pipeline.json`
- `output/replays/pre-geometry-pipeline-summary.json`
- `reports/pre-geometry-replay-pipeline.md`

## Acceptance criteria

- Replay 002 completes the safe pre-geometry pipeline without structural parser/schema incompatibility.
- Replays 003 and 004 are processed only after replay 002 succeeds.
- Replay 005 remains untouched beyond existing metadata.
- Outputs stay below 10 MiB.
- The report separates approved pre-geometry evidence from blocked geometry-dependent work.

## Required validation

- ESLint on new or modified JavaScript.
- JSON parsing for new outputs.
- Output-size checks.
- Task queue validation.
- Git verification that `.dem` files and global replay 001 outputs were not modified or committed.

## Gate result

Produce one of:

- `pre_geometry_pipeline_ready_for_geometry_profile_tasks`
- `pre_geometry_pipeline_blocked_by_replay_002`
- `pre_geometry_pipeline_partial`

## Documentation updates

Update `reports/latest.md` and `docs/PROJECT_STATE.md` only when justified.

## Git scope

Use explicit staging only. Commit separately from task 019.

## Expected report

Summarize replay 002 smoke result, replay 003/004 processing, structural data quality comparison, replay 005 protection, and next blocked geometry-profile work.

## Stop conditions

Stop if replay 002 reveals structural parser or schema incompatibility.
