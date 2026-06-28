# Task 030: Discover Multi-Replay Damage Healing Fields

Status: completed
Execution mode: autonomous
Project stage: Independent multi-replay event layers
Related experiment: damage and healing field discovery
Priority: high
Depends on: task 029 completed with gate `death_event_layer_ready_with_limitations`
Unlocked by: death/assist/respawn event layer available for replays 001-004 without requiring semantic occupancy
Blocks: future combat segment feasibility decision

## Objective

Discover and validate available damage and healing fields across replays 001-004 as descriptive counters and temporal deltas.

## Context to read

- `AGENTS.md`
- `docs/PROJECT_STATE.md`
- `docs/DECISIONS.md`
- `tasks/completed/029-extract-multi-replay-death-assist-respawn-events.md`
- `reports/multi-replay-death-assist-respawn-events.md`
- `output/replays/replay_001/canonical-death-events.json`
- equivalent canonical death-event outputs for replays 002-004
- player/controller/pawn fields directly needed for damage, healing, identity, and counter sampling

## Work requested

- Inspect controller, pawn, and related player fields for hero damage, objective damage, healing, damage taken, self damage, ownership, source/target identity, reset behavior, and temporal granularity.
- Process replays 001-004 independently.
- Produce per-replay field audits, sampled counter timelines, delta summaries, and validation results.
- Compare field availability and counter behavior across replays.
- Assess whether temporal damage/healing segments are mechanically feasible.

## Constraints

- Do not process replay 005.
- Do not define fights.
- Do not judge combat quality.
- Do not infer intent.
- Do not use occupancy episodes, transitions, rotations, or semantic lane assignment.
- Do not assume current Deadlock damage or soul mechanics apply to these replay builds.
- Keep outputs below 10 MiB each.

## Inputs

Replay files 001-004, player/controller/pawn identity fields, canonical death events, and parser entity fields that expose damage/healing counters or related evidence.

## Outputs

- `output/replays/replay_001/damage-healing-field-audit.json`
- `output/replays/replay_001/damage-healing-counter-timeline.json`
- `output/replays/replay_001/damage-healing-delta-summary.json`
- `output/replays/replay_001/damage-healing-validation.json`
- equivalent files for replay 002, replay 003, and replay 004
- `output/replays/multi-replay-damage-healing-comparison.json`
- `output/replays/damage-healing-feasibility-gate.json`
- `reports/multi-replay-damage-healing-field-discovery.md`

## Acceptance criteria

- Field availability is reported per replay and per player.
- Counter value types, monotonicity, reset behavior, and update frequency are reported.
- Delta summaries preserve negative or reset-like deltas instead of silently dropping them.
- Identity linkage is reported for every sampled player timeline.
- Temporal segment feasibility is stated without creating fight segments.
- Replay 005 protection is explicitly validated.

## Required validation

- ESLint on new or modified JavaScript.
- JSON parsing.
- Output-size checks.
- Deterministic repeatability.
- Counter monotonicity and reset checks.
- Identity reconciliation checks.
- Replay 005 protection.
- Task queue validation.
- Git verification that `.dem` files and prior outputs were not modified.

## Gate result

Allowed results:

- `damage_healing_fields_ready_for_segments`
- `damage_healing_fields_ready_with_limitations`
- `damage_healing_sources_insufficient`

## Documentation updates

Update `docs/PROJECT_STATE.md`, `docs/DECISIONS.md`, and `reports/latest.md` when justified.

## Git scope

Use explicit staging only. Commit this task separately from task 029.

## Expected report

Summarize fields found, per-replay availability, counter behavior, temporal granularity, reset limitations, source/target limitations, feasibility gate, and replay 005 protection.

## Stop conditions

Stop after producing the damage/healing field gate and report. Do not promote fight grouping, transition detection, objective analysis, replay 005 processing, or semantic occupancy work.
