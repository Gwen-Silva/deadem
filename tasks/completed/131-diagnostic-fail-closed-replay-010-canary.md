# Task 131 - Run Missing Entity Diagnostic Fail-Closed Replay 010 Canary

Status: completed

Gate: `diagnostic_fail_closed_replay_010_canary_ready`

## Objective

Run a strictly limited replay_010 canary for
`recovery.diagnoseMissingEntityFailClosed` to confirm the real missing-entity
boundary is captured without recovery, skip, placeholders, canonicalization, or
continuation.

## Result

The default pass still fails at the known missing entity:

`Unable to find an entity with index [ 2905 ]`

The diagnostic pass used only `recovery.diagnoseMissingEntityFailClosed: true`.
It recorded one compact `missing_entity_fail_closed` diagnostic and still
threw the same missing-entity error.

Boundary captured:

- packet ordinal: 954
- loop: 33
- updated entries: 34
- operation: UPDATE
- entity index: 2905
- previous entity index: 2717
- index delta: 187
- payload bits: 193
- read counts: before index 5724, after index 5734, after command 5736, after action 5736
- entityData bit length: 5936

## Scope Held

Only replay_010 was processed. Replay_011, replay 005, replays 006-008,
candidates 012-020, samples, and output/replays were not accessed or processed.

No recovery, skip mode, placeholder entity, fake fields, synthetic registry
state, parser continuation after failure, canonical facts, source artifacts,
match facts, spatial/macro/mechanics/fight/decision/ML outputs, Java, Clarity,
external parser, WSL, iaflow, or Product Reviewer automation were used.
