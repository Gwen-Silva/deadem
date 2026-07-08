# Task 163 - Design Post-Mini-Pilot Death Validation Expansion Decision

Status: completed

Gate: `post_batch_death_validation_expansion_decision_ready`

Commit message: `Design post batch death validation expansion decision`

## Summary

Task 163 produced a no-replay decision package for the next step after the Task
162 controlled batch `death_validation` compact mini-pilot.

Task 162 evidence was preserved without overclaim:

- replay_010 emitted compact `death_validation` with `eventCount: 45` and
  `duplicateKeyCount: 0`.
- replay_011 emitted compact `death_validation` with `eventCount: 80` and
  `duplicateKeyCount: 0`.
- schema validation, output policy audit, and size audit passed.
- `eventCount` remains a source-observed counter transition candidate count,
  not a final death fact or gameplay truth.

## Decision

Selected next action:
`prepare_expanded_death_validation_authorization_manifest`.

The next task should prepare the explicit replay authorization manifest before
any expanded dry-run or real emission. The manifest must name every replayId and
localPath, authorize only `death_validation_compact_emission` if real artifacts
are intended, preserve replay_005 as holdout, keep replays 006-008 blocked, and
authorize candidates 012-020 only one by one.

## Rejected Actions

- No 15-replay processing was authorized.
- No new `death_validation.json` artifact was emitted.
- No `death_events`, `respawn_events`, timelines, objective lifecycle, player
  identity rows, attribution, field values, final facts, or gameplay
  interpretation were emitted.

## Protection

No replay was opened, hashed, copied, inspected, parsed, or processed. Replay
005, replays 006-008, candidates 012-020, `samples/**`, and `output/replays/**`
were not accessed or processed. Parser/engine behavior and `packages/deadem/**`
were not modified. Task 164 was not created.
