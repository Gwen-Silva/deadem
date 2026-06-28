# Task 029: Extract Multi-Replay Death Assist Respawn Events

Status: completed
Execution mode: autonomous
Project stage: Independent multi-replay event layers
Related experiment: death assist respawn event layer
Priority: high
Depends on: canonical player timelines available; one-second spatial timelines available for replays 001-004; identity reconciliation available; semantic occupancy branch frozen
Unlocked by: task 028 gate equals `one_second_frozen_comparison_resolution_sensitive` and replay 005 remains protected
Blocks: damage and healing field discovery

## Objective

Construct a descriptive multi-replay death, assist, and respawn event layer for replays 001-004 using independent replay signals, identity reconciliation, and one-second spatial evidence where useful.

## Context to read

- `AGENTS.md`
- `docs/PROJECT_STATE.md`
- `docs/DECISIONS.md`
- completed tasks 027 and 028
- `reports/one-second-multi-replay-spatial-extraction.md`
- `reports/descriptive-spatial-evidence-layer.md`
- one-second spatial manifests and shards for replays 001-004
- parser/player APIs and entity fields directly needed to inspect death, assist, respawn, alive, health, counter, pawn, and economy signals

## Work requested

- Inspect event and field sources for deaths, kills, assists, alive/dead state, health, death counters, kill counters, assist counters, respawn timers, pawn lifecycle, controller possession, and economy values.
- Process replays 001-004 independently.
- Build canonical death and respawn events with evidence, confidence, validation flags, spatial context, and optional economy context.
- Preserve unresolved and low-confidence cases.
- Compare event quality across replays.
- Generate compact deterministic review samples.

## Constraints

- Do not process replay 005.
- Do not use semantic lane occupancy, occupancy episodes, transitions, rotations, or strategic interpretation.
- Do not infer death from pawn replacement alone.
- Do not assume current Deadlock soul or death mechanics apply to these replay builds.
- Keep lane information physical and descriptive only.
- Keep individual outputs below 10 MiB.

## Inputs

Replay files 001-004, one-second spatial timeline shards, parser entity fields, player/controller/pawn identity fields, and available replay event descriptors.

## Outputs

- `output/replays/replay_001/death-event-source-audit.json`
- `output/replays/replay_001/canonical-death-events.json`
- `output/replays/replay_001/respawn-events.json`
- `output/replays/replay_001/death-event-validation.json`
- equivalent files for replay 002, replay 003, and replay 004
- `output/replays/multi-replay-death-event-comparison.json`
- `output/replays/death-event-review-samples.json`
- `output/replays/death-event-gate.json`
- `reports/multi-replay-death-assist-respawn-events.md`

## Acceptance criteria

- Each canonical death has exactly one victim.
- A player cannot die twice without an intervening respawn or recovery.
- Dead duration is non-negative when respawn is known.
- Canonical times are ordered.
- Ordinary deaths are followed by respawn unless the replay ends first.
- Killer does not equal victim unless suicide is explicitly classified.
- Assist identities are unique.
- Duplicate sources collapse into one canonical event.
- Counter reconciliation is reported when available.
- Spatial timestamp-age checks are reported.
- Replay 005 protection is explicitly validated.

## Required validation

- ESLint on new or modified JavaScript.
- JSON and JSONL parsing.
- Output-size checks.
- Deterministic repeatability.
- Chronological event validation.
- Death/respawn state-machine validation.
- Identity reconciliation.
- Source-count reconciliation.
- Spatial timestamp-age checks.
- Replay 005 protection.
- Task queue validation.
- Git verification that `.dem` files and prior outputs were not modified.

## Gate result

Allowed results:

- `death_event_layer_ready`
- `death_event_layer_ready_with_limitations`
- `death_event_semantics_require_minimal_review`
- `death_event_sources_insufficient`

## Documentation updates

Update `docs/PROJECT_STATE.md`, `docs/DECISIONS.md`, and `reports/latest.md`.

## Git scope

Use explicit staging only. Commit this task separately from any damage/healing follow-up.

## Expected report

Summarize sources found, death/respawn counts, killer and assist coverage, counter reconciliation, position and economy coverage, unresolved cases, gate result, and next allowed task.

## Stop conditions

Stop after producing the death-event gate and report. If the gate is ready or ready with limitations, create a separate autonomous damage/healing field-discovery task and execute it only if it is fully specified and queue policy permits it. Do not process replay 005.
