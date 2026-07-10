# Task 181 - Build Alive Dead Respawn Compact State Artifact

Status: completed

Gate: `alive_dead_respawn_compact_bounded32_ready` (historical; reclassified by Task 182/183)

Commit: 15f276cc1859045f96c2d4a75ba9f5d1d1d61f80

## What Changed

- Added `schemas/alive-dead-respawn-compact.schema.json`.
- Added `tools/emit-alive-dead-respawn-compact-artifacts.mjs`.
- Added schema and runner tests.
- Added npm script `emit:alive-dead-respawn-compact`.
- Emitted compact `alive_dead_respawn` artifacts for the pilot and bounded-32 runs.
- Updated project state, milestone, capability map, product roadmap, registry, task index, and capability index.

## Runs

- Pilot: replay_010, replay_011, replay_021, replay_036.
- Pilot gate: `alive_dead_respawn_compact_pilot_ready`.
- Pilot artifacts emitted: 4.
- Bounded-32 gate: `alive_dead_respawn_compact_bounded32_ready`.
- Bounded-32 artifacts emitted: 32.

## Result

- `totalDeathCounterIncrementCandidates`: 2552.
- `deathValidationBridgeMatchStatus`: `matched`.
- `totalTransitionCandidates`: 0.
- `transitionRowsMaterialized`: false.
- `readyForAliveDeadRespawnConsumption`: true.
- `readyForCanonicalDeathEventDesign`: false.

The runner intentionally emits candidate-count summaries, not per-participant
transition rows, because the current safe inputs provide aggregate bridge counts
but no policy-safe normalized transition timing rows.

## Protections

- No new `death_validation.json`, `semantic_foundation.json`, or `participant_identity.json` was emitted.
- No replay file was opened or parsed by the Task 181 runner.
- Replay 005 and replays 006-008 remain blocked.
- No replay outside the explicit manifests was processed.
- No parser/engine behavior or `packages/deadem/**` files were modified.
- No names, raw IDs, field values, raw ticks, raw timestamps, positions, attribution, final facts, or gameplay interpretation were emitted.
- Task 182 was not created.

## Next Step

Design the canonical death-event input contract, including whether a future
policy-safe transition row layer is required before canonical death events,
attribution, or teamfight detection.

## Task 182 Correction

Task 182 reclassified this task as `bridge_only_scaffolding`.

The Task 181 runner did not open or parse replays, did not materialize
transition rows, and copied `death_validation.eventCount` only as a bridge
count. Its previous `readyForAliveDeadRespawnConsumption` claim is not
supported as active life-state coverage.

The active replay-sourced transition row baseline is now Task 182
`life_state_transition_candidates`.

## Task 183 Consistency Note

Task 183 preserves the Task 182 correction: Task 181 is bridge-only
scaffolding and remains `needs-validation` for active transition coverage. It
does not provide replay-sourced per-participant life-state transition rows.
