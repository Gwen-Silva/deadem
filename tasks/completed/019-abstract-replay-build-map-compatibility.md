# Task 019: Abstract Replay Build And Map Compatibility

Status: completed
Execution mode: autonomous
Project stage: Multi-replay datasets
Related experiment: replay intake protocol
Priority: high
Depends on: task 016 completed with gate `replays_require_build_specific_work`
Unlocked by: replay intake shows parser-compatible replays but missing direct build/map metadata and unverified geometry compatibility
Blocks: parameterized common replay pipeline for experiments 01-18

## Objective

Create a build/map compatibility abstraction that can classify the five inventoried replays without assuming build 6592 geometry applies to all of them.

## Context to read

- `AGENTS.md`
- `docs/PROJECT_STATE.md`
- `tasks/pending/019-abstract-replay-build-map-compatibility.md`
- `data/replay-manifest.json`
- `output/replay-intake-summary.json`
- `output/replay-compatibility-matrix.json`
- `output/replay-processing-plan.json`
- `output/replay-script-parameterization-audit.json`
- parser metadata APIs and experiment 12 build-identification logic only when directly needed

## Work requested

- Identify a reproducible source for build, content version, map identity, or equivalent schema/geometry fingerprint for each replay.
- Separate parser compatibility from geometry compatibility.
- Group replays by detected build/map/fingerprint.
- Define how geometry profiles should be named and referenced by later replay-isolated outputs.
- Do not calibrate geometry from occupancy outcomes.

## Constraints

- Do not run occupancy, transition detection, model recalibration, combat, objective, economy, or macro analysis.
- Do not process replay 005 beyond compatibility metadata/fingerprint extraction.
- Do not assume replay 001 build 6592 topology applies to any other replay.
- Do not overwrite existing replay 001 outputs.
- Do not commit `.dem` files.

## Inputs

- `samples/*.dem`
- intake outputs from task 016
- parser/build-identification code paths only as required for metadata/fingerprint extraction

## Outputs

- `output/replay-build-map-compatibility.json`
- `output/replay-geometry-profile-plan.json`
- `reports/replay-build-map-compatibility.md`

## Acceptance criteria

- Each replay has a build/map/fingerprint status with evidence and uncertainty.
- Geometry reuse is explicitly allowed, blocked, or unverified per replay.
- Replay 005 remains protected from model/geometry selection beyond metadata compatibility checks.
- A downstream task can decide whether common pipeline parameterization may proceed.

## Required validation

- ESLint on new or modified JavaScript.
- JSON parsing for new outputs.
- Output-size checks.
- Task queue validation.
- Git verification that `.dem` files and previous outputs were not modified or committed.

## Gate result

Produce one of:

- `build_map_compatibility_ready_for_pipeline_parameterization`
- `build_map_compatibility_requires_geometry_profiles`
- `build_map_compatibility_blocked`

## Documentation updates

Update `reports/latest.md` and `docs/PROJECT_STATE.md` only when justified.

## Git scope

Use explicit staging only. Commit separately from task 016.

## Expected report

Summarize detected build/map/fingerprint evidence, geometry-profile grouping, replay 005 protection, and the next allowed pipeline task.

## Stop conditions

Stop if build/map compatibility cannot be established from available parser metadata or reproducible fingerprints.
