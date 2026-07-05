# Local Replay Missing Entity Recovery Canary

Gate: `local_replay_missing_entity_recovery_partial_progress`
Canary input: `.local/deadem/replays/inbox/partida_010.dem`
Replay ID: `replay_010`

## Frozen Acceptance Matrix

Default behavior reproduced: `true`
Recovery advanced past Task 105 failure: `true`
Recovery reached end: `false`
Fake entities created: `false`
Fields materialized: `false`

## Task 105 Summary

Task 105 localized the prior failure to `nextTick` parser advancement after 953 ticks, before class lookup or field access.

## Default Pass

Expected failure reproduced: `true`
Ticks advanced: `953`
Error: `Unable to find an entity with index [ 2905 ]`

## Recovery Pass

Recovery enabled: `true`
Advanced past old 953-tick failure: `true`
Reached end: `false`
Ticks advanced: `2863`
Later failure: `entity index out of range`

## Recovery Warnings

Unresolved entity references: `1911`
Missing class baselines: `0`
Unsupported recoveries: `0`
Payload-size missing recoveries: `0`
Committed warning sample: `25 of 1911`
Full warning log: `.local/deadem/cache/local-replay-processing/replay_010/missing-entity-recovery/recovery-warnings-full.json`

## Protection

Default behavior changed: `false`
Parser internals modified: `true, narrowly for opt-in recovery threading`
Canonical package constructed: `false`
Factual artifacts emitted: `false`
Replay 005 processed: `false`
Bot fixtures processed: `false`
Candidates 011-020 touched: `false`
Branch/source audit passed: `true`

Summary output: `output/local-replay-processing/replay_010-missing-entity-recovery/`

Task 107 was not created.
