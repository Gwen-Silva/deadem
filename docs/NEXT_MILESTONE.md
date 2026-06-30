# Next Milestone: Spatial Foundation First

## Current Project State

Deadem now has normal replay parsing for fixtures 001-004 and 009, replay-009 factual telemetry, canonical factual-state outputs, query/export tooling, a static inspector, and validated inspector review workflows.

The validated factual layer supports player identity, life/death/respawn events, `m_iGoldNetWorth` endpoint summaries, raw Mid Boss/structure events, candidate Spirit Urn records, and bounded visual validation overlays. It applies zero mechanic effects.

## Remaining Blockers

- Replay 005 remains protected.
- Bot fixtures 006-008 remain unsupported.
- Build `23916427` has no confirmed patch mapping.
- Active-game time and pause intervals are unavailable.
- Map transform, regions, lanes, objective geometry, structure geometry, and proximity are unavailable.
- Spirit Urn identity, Rejuvenator observability, Patron/base identity, objective completion, mechanic activation, combat/fight grouping, map pressure, macro interpretation, and decision analysis remain blocked or partial.

## Dependency Graph Summary

The most central blocked node is `map_geometry`. It depends on validated coordinates plus external or independently supported geometry, and it unlocks lane presence, movement paths, objective proximity, structure association, rotations, map pressure prerequisites, and later bounded macro context.

## Candidate Milestone Comparison

Track A, spatial and map geometry foundation, has the highest downstream impact and dependency centrality. It also has open input requirements. Cross-replay canonical generalization is the strongest fallback if map inputs are unavailable, because it improves holdout readiness using existing data but does not unlock spatial capabilities.

## Selected Milestone

Primary milestone: **spatial foundation first**.

Optional preparatory milestone: **cross-replay canonical generalization if map assets are unavailable or delayed**.

The milestone is selected because spatial grounding is the largest shared blocker across lane presence, movement paths, objective proximity, map pressure prerequisites, rotations, and later macro context.

## Required New Inputs

- Authoritative or calibratable map geometry for the replay-009 map/build.
- Independent coordinate anchors with provenance.

Current map geometry must not be silently assumed valid for build `23916427`.

Task 069 acquired limited candidate inputs: local installed Deadlock map-package
metadata, GameTracking/deadlock-metadata references, and replay-derived landmark
candidates. The gate is
`replay_009_map_geometry_inputs_ready_with_limitations`. The current installed
map package is useful as a local-only candidate, but build compatibility,
extractable geometry, and independent map-coordinate anchors are still
unresolved.

Task 070 inspected the local-only preferred VPK candidate and the local package
index. It found bounded spatial resource metadata but no coordinate-bearing map
landmarks, so the gate is `replay_009_candidate_transform_not_ready`.

## Validation Strategy

1. Acquire geometry and provenance.
2. Validate coordinate transform against independent anchors.
3. Quantify projection coverage, out-of-bounds samples, and ambiguity.
4. Validate generic regions separately from lanes.
5. Validate objective and structure static geometry separately from entity semantics.
6. Integrate only factual spatial fields with visible semantic limits.

## Proposed Task Sequence

See `output/project-milestone-analysis/recommended-task-sequence.json`.

The first task is blocked on user-supplied or otherwise authorized geometry/calibration inputs.

## Replay 005 Release Criteria

Replay 005 release decision: `replay_005_release_not_ready`.

Release is not ready. Missing evidence includes canonical outputs for more than one human replay, cross-replay schema stability, formal no-replay-specific assumptions, and a resolved or explicitly scoped spatial decision.

## Explicit Non-Goals

- Do not inspect or process replay 005.
- Do not process bot fixtures 006-008.
- Do not apply mechanic effects.
- Do not infer objective completion from deletion.
- Do not infer lane occupancy from nearest lane.
- Do not implement fight, macro, or decision-quality analysis.
