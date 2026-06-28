# Task 032: Build Unified Descriptive Match-State Timeline

Status: completed
Execution mode: autonomous
Project stage: Unified descriptive event layers
Related experiment: descriptive match-state timeline
Priority: high
Depends on: task 031 completed with gate `objective_lifecycle_ready_with_limitations`
Unlocked by: validated player positions, death/respawn events, net-worth context, damage/healing deltas, and objective lifecycle outputs exist for replays 001-004
Blocks: future factual match-state querying

## Objective

Combine validated descriptive layers into replay-isolated match-state timelines for replays 001-004.

## Context to read

- `AGENTS.md`
- `docs/PROJECT_STATE.md`
- `docs/DECISIONS.md`
- completed tasks 027, 029, 030, and 031
- `reports/multi-replay-objective-lifecycle.md`
- one-second spatial timeline manifests for replays 001-004
- canonical death and respawn events for replays 001-004
- damage/healing counter timelines for replays 001-004
- objective lifecycle timelines for replays 001-004

## Work requested

- Build a factual per-second match-state timeline for each replay.
- Include only validated layers: player positions, alive/dead state, death/respawn events, net worth, objective states, objective damage and hero damage deltas.
- Preserve physical lane-axis proximity as geometry, not semantic lane occupancy.
- Generate per-replay quality summaries and a cross-replay comparison.

## Constraints

- Do not process replay 005.
- Do not define fights.
- Do not evaluate decisions.
- Do not infer intent.
- Do not use semantic occupancy, transitions, rotations, or strategic lane assignment.
- Keep output shards below 10 MiB.

## Inputs

Replay-isolated one-second spatial rows, death events, respawn events, damage/healing counter rows, and objective timeline shards for replays 001-004.

## Outputs

- `output/replays/replay_001/match-state-timeline.jsonl`
- `output/replays/replay_001/match-state-quality.json`
- equivalent files for replay 002, replay 003, and replay 004
- `output/replays/multi-replay-match-state-comparison.json`
- `output/replays/match-state-timeline-gate.json`
- `reports/unified-descriptive-match-state-timeline.md`

## Acceptance criteria

- Every timeline row is chronological.
- Player state comes from spatial rows plus death/respawn intervals.
- Objective state comes from objective lifecycle timeline shards.
- Damage and healing deltas remain descriptive counters.
- No fight grouping, strategic evaluation, transition detection, or semantic occupancy fields are introduced.
- Replay 005 protection is explicitly validated.

## Required validation

- ESLint on new or modified JavaScript.
- JSON and JSONL parsing.
- Output-size checks.
- Deterministic repeatability.
- Chronological ordering.
- Player-time key coverage.
- Objective-state join coverage.
- Death/respawn interval consistency.
- Replay 005 protection.
- Task queue validation.
- Git verification that `.dem` files and prior outputs were not modified.

## Gate result

Allowed results:

- `match_state_timeline_ready`
- `match_state_timeline_ready_with_limitations`
- `match_state_sources_insufficient`

## Documentation updates

Update `docs/PROJECT_STATE.md`, `docs/DECISIONS.md`, and `reports/latest.md` when justified.

## Git scope

Use explicit staging only. Commit this task separately from task 031.

## Expected report

Summarize rows, shard strategy, layer coverage, limitations, gate result, and replay 005 protection.

## Stop conditions

Stop after producing and committing the unified descriptive match-state timeline. Do not promote fights, strategic analysis, transitions, semantic occupancy, or replay 005 processing.
