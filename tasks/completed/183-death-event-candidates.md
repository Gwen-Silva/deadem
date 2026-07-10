# Task 183 - Build Canonical Death Event Candidate Baseline And Consumption Contract

Status: completed

Gate: `task181_docs_corrected_death_event_candidates_bounded32_ready`

Commit: pending

## What Changed

- Corrected the remaining Task 181/182 documentation consistency issues.
- Added `schemas/death-event-candidates.schema.json`.
- Added `tools/emit-death-event-candidates.mjs`.
- Added schema and runner tests.
- Added npm script `emit:death-event-candidates`.
- Added `docs/codex/DEATH_EVENT_CANDIDATE_CONSUMPTION_CONTRACT.md`.
- Emitted `death_event_candidates` artifacts for the pilot and bounded-32 runs.
- Updated project state, milestone, capability map, product roadmap, registry,
  task index, and capability index.

## Runs

- Pilot: replay_010, replay_011, replay_021, replay_036.
- Pilot gate: `death_event_candidates_pilot_ready`.
- Pilot candidates: 341.
- Bounded-32 gate: `death_event_candidates_bounded32_ready`.
- Bounded-32 artifacts emitted: 32.
- Bounded-32 candidates: 2,552.

## Result

- Candidate count: 2,552.
- Candidates with participant refs: 2,552.
- Candidates with hero refs: 2,552.
- Candidates with team refs: 2,552.
- Candidates with normalized time: 2,552.
- Unmapped candidates: 0.
- Duplicate candidates: 0.
- Source bridge versus Task 182 transition rows: `matched`.
- Death-event candidate consumption readiness: true.
- Final death-event emission readiness: false.
- Attribution readiness: false.
- Teamfight detection readiness: false.

## Protections

- The runner consumed only versioned Task 180 and Task 182 artifacts.
- No `.dem` file was opened, hashed, inspected, copied, or parsed.
- No parser, Player, batch replay runner, Java, Clarity, external parser, WSL,
  iaflow, or Product Reviewer automation was used.
- Replay 005 and replays 006-008 remained blocked.
- No raw IDs, field values, raw ticks, raw timestamps, positions, attribution,
  final facts, final death events, respawn facts, or gameplay interpretation
  were emitted.
- No parser/engine behavior or `packages/deadem/**` files were modified.
- No recovery, skip, placeholder, default behavior change, or parser opt-in was
  added.
- Task 184 was not created.

## Next Step

Build a candidate-safe consumption surface or design final death-event
confirmation criteria in a separate task. Do not use this artifact for final
death, attribution, teamfight, or gameplay claims.
