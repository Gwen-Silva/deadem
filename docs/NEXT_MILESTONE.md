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

Task 071 ingested a replay-009 participant annotation packet as advisory human
evidence. The text packet supports search and identity constraints, but the five
referenced map/minimap images were not locally accessible, so the gate is
`replay_009_independent_landmark_coordinates_missing`.

Task 072 measured the subsequently supplied local map/minimap images as
human-supplied visual evidence. It inventories image roles and hashes, records
standard/minimap registration limits, measures Mid Boss, Walker, Guardian, and
base-symbol pixel coordinates, and preregisters fit/validation anchors. The gate
is `replay_009_independent_landmark_coordinates_ready_with_limitations`: a
bounded transform-validation retry can be attempted, but no transform, lane,
region, proximity, or mechanic effect has been produced.

Task 073 attempted that bounded retry and stopped before fitting. The gate is
`replay_009_candidate_transform_not_ready`: map-image coordinates are available,
but replay-side fixed Mid Boss/Walker world coordinates are not exposed in the
compact canonical evidence, and the six replay Walker entities cannot yet be
paired with six map Walker symbols by pre-residual evidence. The next missing
layer is non-circular replay-side fixed-entity coordinates and Walker
team/lane identity evidence, not a broader map-geometry search.

Task 074 audited that missing layer and confirmed it remains unavailable in the
committed compact replay-009 outputs. The gate is
`replay_009_walker_identity_coordinates_not_ready`: `CNPC_MidBoss` and
`CNPC_Boss_Tier2` expose class/lifecycle/health evidence plus
component/reference-style properties, but no usable replay-world coordinates or
pre-fit Walker team/lane identities. The next task should diagnose parser
spatial-property extraction for those target classes before any transform retry.

Task 075 diagnosed that parser spatial-property layer directly. The gate is
`replay_009_fixed_entity_spatial_properties_ready_with_gaps`: bounded
parser-level evidence exposes `CBodyComponent.m_vecX/Y/Z` and
`CBodyComponent.m_cellX/Y/Z` coordinate-like fields for `CNPC_Boss_Tier2`,
including CREATE payloads. The earlier gap was a compact-filter omission, not a
decoder failure. The next missing layer is bounded coordinate extraction across
target generations and non-circular Walker identity resolution; transform
fitting, lane/region output, proximity, and mechanic effects remain blocked.

Task 076 completed the bounded coordinate extraction layer with gaps. The gate
is `replay_009_fixed_entity_coordinates_ready_with_gaps`: two late Walker
generations have supported vector-only replay coordinates and all six Walkers
have raw team values, but only two of eight target generations have coordinates,
Mid Boss has no coordinate anchor, named Walker teams and lanes remain
unresolved, and no correspondence is fit-eligible. The next missing layer is
identity-only Walker resolution before any transform retry.

Task 077 attempted that identity-only Walker resolution. The gate is
`replay_009_walker_identity_not_ready`: raw team values remain unmapped to
Sapphire/Amber, participant Walker annotations and existing visual-validation
metadata remain class/set-level rather than handle-specific, and no direct
lane/route/spawn/name field was exposed. Transform retry remains blocked until
new non-coordinate evidence links at least some Walker handles to named
team/lane map landmarks before residual inspection.

Task 078 acquired the first narrow identity improvement. The gate is
`replay_009_walker_lane_identity_evidence_ready_with_gaps`: participant and
parser-roster controls support raw team `3` as Sapphire/Archmother and raw team
`2` as Amber/Hidden King, so all six Walkers have named faction. This still
does not identify Yellow/Blue/Green lane or a specific map Walker landmark for
any handle, so transform retry remains blocked pending lane-only identity
evidence.

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
