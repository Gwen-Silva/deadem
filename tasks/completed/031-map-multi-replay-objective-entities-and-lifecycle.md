# Task 031: Map Multi-Replay Objective Entities And Lifecycle

Status: completed
Execution mode: autonomous
Project stage: Independent multi-replay event layers
Related experiment: objective entity and lifecycle layer
Priority: high
Depends on: shared structural geometry available; structural lane axes available; one-second timelines available; death event layer available; objective-damage counters discovered
Unlocked by: task 030 completed with gate `damage_healing_fields_ready_with_limitations`
Blocks: unified descriptive match-state timeline

## Objective

Build a multi-replay objective-entity and objective-lifecycle layer for replays 001-004 using replay-observed entities, health/state fields, structural geometry, and objective-damage counters.

## Context to read

- `AGENTS.md`
- `docs/PROJECT_STATE.md`
- `docs/DECISIONS.md`
- completed tasks 022, 023, 029, and 030
- `reports/structural-lane-axis-topology.md`
- `reports/lane-axis-distance-mapping.md`
- `reports/multi-replay-death-assist-respawn-events.md`
- `reports/multi-replay-damage-healing-field-discovery.md`
- `output/replay-lane-axis-topology-profile.json`
- `output/replay-lane-axis-cross-replay-consensus.json`
- `output/replays/replay_001/geometry-structural-inventory.json`
- equivalent structural inventories for replays 002-004
- objective-damage counter outputs for replays 001-004
- parser entity fields directly needed to inspect stable objective classes, position, health, state, team, and lifecycle signals

## Work requested

- Discover candidate objective and map-state entities for replays 001-004.
- Classify entities as confirmed objective, probable objective, structural non-objective, neutral entity, or unresolved.
- Reconcile stable objective identities across replays using class, team, structural role, lane-axis association, ordered position, coordinates, and cross-replay correspondence.
- Inspect health, max-health, alive, dormant, phase, shield, protection, spawn, despawn, and ownership fields where exposed.
- Build replay-isolated objective timelines and canonical lifecycle events.
- Reconcile objective health loss with player objective-damage counter deltas without assigning source-target damage unless directly supported.
- Validate objective IDs, lifecycle chronology, health-state consistency, lane-axis assignment, and cross-replay identity reconciliation.

## Constraints

- Do not process replay 005.
- Do not group fights.
- Do not judge objective decisions.
- Do not infer strategic intent.
- Do not use semantic occupancy, transitions, rotations, or current Deadlock mechanics as proof.
- Use physical lane-axis proximity only as structural geometry.
- Keep individual files below 10 MiB.

## Inputs

Replays 001-004, structural geometry and lane-axis outputs, one-second player timelines, objective-damage counter outputs, and parser-exposed objective/map-state entity fields.

## Outputs

- `output/replays/replay_001/objective-entity-inventory.json`
- `output/replays/replay_001/objective-timeline.jsonl`
- `output/replays/replay_001/objective-lifecycle-events.json`
- `output/replays/replay_001/objective-validation.json`
- equivalent files for replay 002, replay 003, and replay 004
- `output/replays/multi-replay-objective-identity-map.json`
- `output/replays/multi-replay-objective-lifecycle-comparison.json`
- `output/replays/objective-damage-reconciliation.json`
- `output/replays/objective-review-samples.json`
- `output/replays/objective-lifecycle-gate.json`
- `reports/multi-replay-objective-lifecycle.md`

## Acceptance criteria

- Stable objective IDs are unique within each replay.
- Objective health/state fields and missing fields are reported.
- Lifecycle events are chronological and evidence-backed.
- Destroyed non-respawning structures do not become alive again unless documented.
- Lane-associated structures map to exactly one physical lane axis.
- Central objectives are not assigned to a lane axis.
- Cross-replay IDs preserve the same structural role where evidence allows.
- Objective-damage reconciliation is reported with limitations.
- Review samples preserve unresolved or low-confidence cases.
- Replay 005 protection is explicitly validated.

## Required validation

- ESLint on new or modified JavaScript.
- JSON and JSONL parsing.
- Output-size checks.
- Deterministic repeatability.
- Objective-ID uniqueness.
- Chronological lifecycle checks.
- Health-state consistency checks.
- Cross-replay identity reconciliation checks.
- Lane-axis assignment validation.
- Objective-damage reconciliation.
- Replay 005 protection.
- Task queue validation.
- Git verification that `.dem` files and prior outputs were not modified.

## Gate result

Allowed results:

- `objective_lifecycle_ready`
- `objective_lifecycle_ready_with_limitations`
- `objective_semantics_require_minimal_review`
- `objective_sources_insufficient`

## Documentation updates

Update `docs/PROJECT_STATE.md`, `docs/DECISIONS.md`, and `reports/latest.md` when justified.

## Git scope

Use explicit staging only. Commit this task separately from any unified match-state follow-up.

## Expected report

Summarize objective classes, stable objective counts, Guardian/Walker/base structure coverage, Patron/Mid Boss/urn coverage, lifecycle events, damage reconciliation, unresolved identities or states, gate result, and replay 005 protection.

## Stop conditions

Stop after producing the objective lifecycle gate and report. If the gate is ready or ready with limitations, create a separate autonomous unified match-state timeline task only if it is fully specified and queue policy permits it. Do not process replay 005.
