# Task 021: Derive Multi-Replay Geometry Profiles

Status: completed
Execution mode: autonomous
Project stage: Multi-replay datasets
Related experiment: multi-replay geometry profiles
Priority: high
Depends on: task 019 completed; task 020 completed; gate `pre_geometry_pipeline_ready_for_geometry_profile_tasks`
Unlocked by: replays 002, 003, and 004 passed the common pre-geometry pipeline
Blocks: parameterized lane mapping and topology

## Objective

Determine whether replays 001-004 share mechanically observable map geometry and topology, and define evidence-based geometry profiles without using occupancy outcomes, lane labels, transition quality, or strategic interpretation.

## Context to read

- `AGENTS.md`
- `docs/PROJECT_STATE.md`
- `docs/DECISIONS.md`
- `data/replay-manifest.json`
- `output/replay-build-map-compatibility.json`
- `output/replay-geometry-profile-plan.json`
- `output/replay-structural-fingerprints.json`
- `output/replay-pairwise-compatibility-matrix.json`
- `output/replays/replay_002/pre-geometry-pipeline.json`
- `output/replays/replay_003/pre-geometry-pipeline.json`
- `output/replays/replay_004/pre-geometry-pipeline.json`
- existing replay 001 geometry, topology, region, and landmark artifacts
- parser/entity fields directly relevant to stable map structures
- experiment scripts that previously derived replay 001 geometry

## Work requested

- Inspect stable world, objective, base, spawn, lane, rail/traversal, neutral, shop, and static map structure evidence for replays 001-004.
- Audit replay 001 geometry provenance.
- Build structural inventories, deterministic anchor matches, transform comparisons, pairwise comparisons, consensus, geometry profiles, and a validation gate.
- Keep replay 005 untouched beyond existing metadata/fingerprints.

## Constraints

- Do not use occupancy quality outputs as geometry evidence.
- Do not detect transitions.
- Do not run combat, objective lifecycle, economy, macro, model recalibration, or human-review tasks.
- Do not assign lane color names as semantic truth.
- Do not process replay 005 for coordinates, structures, objectives, anchors, movement, or geometry.
- Do not overwrite existing outputs.

## Inputs

Replays 001-004, manifest and compatibility outputs, pre-geometry outputs for replays 002-004, and existing replay 001 geometry/topology artifacts.

## Outputs

- `output/replays/replay_001/geometry-structural-inventory.json`
- `output/replays/replay_002/geometry-structural-inventory.json`
- `output/replays/replay_003/geometry-structural-inventory.json`
- `output/replays/replay_004/geometry-structural-inventory.json`
- `output/replay-geometry-anchor-matches.json`
- `output/replay-geometry-transform-comparison.json`
- `output/replay-geometry-pairwise-comparison.json`
- `output/replay-geometry-consensus.json`
- `output/replay-geometry-profiles.json`
- `output/replay-geometry-validation-gate.json`
- `reports/multi-replay-geometry-profile-analysis.md`

## Acceptance criteria

- Structural inventory exists for each replay 001-004.
- Pairwise anchor matching and transform evaluation are deterministic.
- Replay 001 direct/inferred/manual/occupancy-dependent geometry provenance is separated.
- Geometry profile grouping is evidence-based.
- Exactly one allowed gate is produced.
- Replay 005 remains protected.

## Required validation

- ESLint on new or modified JavaScript.
- JSON parsing for new outputs.
- Output-size checks.
- Deterministic-repeatability checks.
- Pairwise matrix symmetry checks.
- Transform residual verification.
- Anchor-match uniqueness checks.
- Task queue validation.
- Git checks confirming replay files, prior outputs, and replay 005 were not modified.

## Gate result

Produce one of:

- `shared_geometry_ready_for_lane_mapping`
- `geometry_profiles_ready_for_lane_mapping`
- `geometry_equivalent_topology_requires_validation`
- `geometry_evidence_requires_minimal_review`
- `geometry_evidence_insufficient`

## Documentation updates

Update `reports/latest.md` and `docs/PROJECT_STATE.md` only when justified.

## Git scope

Use explicit staging only. Commit separately.

## Expected report

Report source inventory, replay 001 provenance audit, coordinate-system comparison, anchor matching, pairwise results, transforms, residuals, topology evidence, profile grouping, reusable and non-reusable components, limitations, gate result, and next allowed tasks.

## Stop conditions

Stop if geometry evidence is insufficient or if topology interpretation requires review before lane mapping.
