# Task 022: Derive Structural Lane Axis Topology

Status: pending
Execution mode: autonomous
Project stage: Multi-replay geometry
Related experiment: multi-replay structural topology
Priority: high
Depends on: task 021 completed with gate `geometry_equivalent_topology_requires_validation`
Unlocked by: `output/replay-geometry-validation-gate.json` gate equals `geometry_equivalent_topology_requires_validation`
Blocks: parameterized lane mapping and topology for replays 001-004

## Objective

Derive and validate neutral physical lane axes and topology ordering for replays 001-004 using only direct structural anchors, objective/structure ordering, traversal evidence, and coordinate relationships.

## Context to read

- `AGENTS.md`
- `docs/PROJECT_STATE.md`
- `docs/DECISIONS.md`
- this task file
- `reports/multi-replay-geometry-profile-analysis.md`
- `output/replay-geometry-validation-gate.json`
- `output/replay-geometry-profiles.json`
- `output/replay-geometry-consensus.json`
- `output/replay-geometry-anchor-matches.json`
- `output/replay-geometry-pairwise-comparison.json`
- `output/replays/replay_001/geometry-structural-inventory.json`
- `output/replays/replay_002/geometry-structural-inventory.json`
- `output/replays/replay_003/geometry-structural-inventory.json`
- `output/replays/replay_004/geometry-structural-inventory.json`
- existing replay 001 topology artifacts only for provenance comparison, not as proof

## Work requested

- Derive neutral physical lane IDs `lane_axis_1`, `lane_axis_2`, and `lane_axis_3` from stable objective, base, traversal, and structure ordering where evidence supports it.
- Compare lane-axis derivations across replays 001-004.
- Separate structural topology evidence from historical lane color aliases.
- Produce a gate that says whether lane mapping/topology parameterization may proceed.

## Constraints

- Do not use occupancy outcomes, player movement density, transition quality, or strategic interpretation.
- Do not process replay 005.
- Do not assign semantic lane colors as truth.
- Do not run occupancy, transition, combat, objective-lifecycle, economy, or macro-analysis tasks.
- Prefer abstention or unresolved topology over unsupported lane-axis assignment.

## Inputs

Task 021 structural inventories, geometry profiles, anchor matches, pairwise comparisons, consensus, and replay 001 topology provenance artifacts.

## Outputs

- `output/replay-structural-lane-axis-candidates.json`
- `output/replay-structural-topology-comparison.json`
- `output/replay-lane-axis-topology-profile.json`
- `output/replay-lane-axis-topology-gate.json`
- `reports/structural-lane-axis-topology.md`

## Acceptance criteria

- Lane-axis candidates are derived only from structural evidence.
- Every lane-axis assignment records anchors, ordering evidence, confidence, and unresolved ambiguity.
- Replay 001 historical lane labels are kept separate from neutral physical IDs.
- Replay 005 remains untouched.
- Exactly one documented gate is produced.

## Required validation

- ESLint on new or modified JavaScript.
- JSON parsing for new outputs.
- Output-size checks.
- Deterministic-repeatability checks.
- Cross-replay topology consistency checks.
- Task queue validation.
- Git checks confirming replay files, prior outputs, and replay 005 were not modified.

## Gate result

Allowed results:

- `structural_topology_ready_for_lane_mapping`
- `structural_topology_requires_minimal_review`
- `structural_topology_insufficient`

## Documentation updates

Update `reports/latest.md` and `docs/PROJECT_STATE.md` only when justified.

## Git scope

Use explicit staging only. Commit separately from task 021.

## Expected report

Summarize structural anchors used, lane-axis candidates, cross-replay consistency, uncertainties, prohibited uses, gate result, and next allowed task.

## Stop conditions

Stop if structural topology remains insufficient, if minimized review is required, or after producing the topology gate. Do not start occupancy or transition detection.
