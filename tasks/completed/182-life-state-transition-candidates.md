# Task 182 - Correct Task 181 Classification And Materialize Replay-Sourced Life-State Transition Candidates

Status: completed

Gate: `task181_reclassified_life_state_transition_candidates_bounded32_ready`

Commit: 5f0a07c03938eef513d0c7288344d93b55393155

## What Changed

- Reclassified Task 181 as `bridge_only_scaffolding`.
- Added `schemas/life-state-transition-candidates.schema.json`.
- Added `tools/emit-life-state-transition-candidates.mjs`.
- Added schema and runner tests.
- Added npm script `emit:life-state-transition-candidates`.
- Emitted replay-sourced `life_state_transition_candidates` artifacts for the pilot and bounded-32 runs.
- Updated project state, milestone, capability map, product roadmap, registry, task index, capability index, and Task 181 completion note.

## Runs

- Pilot: replay_010, replay_011, replay_021, replay_036.
- Pilot gate: `life_state_transition_candidates_pilot_ready`.
- Pilot transition rows: 341.
- Bounded-32 gate: `life_state_transition_candidates_bounded32_ready`.
- Bounded-32 artifacts emitted: 32.
- Bounded-32 transition rows: 2552.

## Result

- Parser completion count: 32.
- Mapped participant rows: 2552.
- Unmapped participant rows: 0.
- Normalized-time rows: 2552.
- Bridge status versus `death_validation.eventCount`: `matched`.
- Canonical death-event candidate design readiness: true.
- Canonical death-event emission readiness: false.
- Attribution readiness: false.
- Teamfight detection readiness: false.

## Protections

- No raw values, raw IDs, raw handles, player slots, account IDs, Steam IDs, raw hero/team values, raw ticks, raw timestamps, positions, field values, attribution, final facts, or gameplay interpretation were emitted.
- Replay 005 and replays 006-008 remained blocked.
- No replay outside the explicit manifests was processed.
- No parser/engine behavior or `packages/deadem/**` files were modified.
- No recovery, skip, placeholder, default behavior change, or parser opt-in was added.
- Task 183 was not created.

## Next Step

Design a canonical death-event candidate contract that consumes `life_state_transition_candidates` without attribution or final fact emission.
