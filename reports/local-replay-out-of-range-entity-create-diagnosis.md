# Local Replay Out-Of-Range Entity Create Diagnosis

Gate: `local_replay_out_of_range_entity_create_boundary_diagnosed`
Canary input: `.local/deadem/replays/inbox/partida_010.dem`
Replay ID: `replay_010`

## Default Pass

Expected Task 105 failure reproduced: `true`
Ticks advanced: `953`
Error: `Unable to find an entity with index [ 2905 ]`

## Recovery Boundary

Advanced past 953 ticks: `true`
Boundary reached: `true`
Current tick: `2862`
Ticks advanced: `2863`
Boundary error: `entity index out of range`

## Boundary Diagnostic

Boundary observed: `true`
Loop: `23`
Updated entries: `42`
Accumulated entity index: `570655505`
Operation: `CREATE`
Class ID: `139`
Serial: `35052`
Before baseline lookup: `true`
Before registerEntity: `true`
Before field extraction: `true`

## Recovery Warnings

Total recovery warnings before boundary: `1911`
Tail committed: `20`
Full warning log: `.local/deadem/cache/local-replay-processing/replay_010/out-of-range-entity-create-diagnosis/recovery-warnings-full.json`

## Protection

Fake entity created: `false`
Fields materialized: `false`
Canonical package constructed: `false`
Factual artifacts emitted: `false`
Replay 005 processed: `false`
Bot fixtures processed: `false`
Candidates 011-020 touched: `false`
Branch/source audit passed: `true`

Summary output: `output/local-replay-processing/replay_010-out-of-range-entity-create-diagnosis/`

Task 108 was not created.
