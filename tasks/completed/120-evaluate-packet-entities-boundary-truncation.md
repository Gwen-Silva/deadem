# Task 120 - Evaluate Opt-In PacketEntities Boundary Truncation Without Semantic Phantom Entries

Status: completed

Gate: `local_replay_packet_entities_boundary_truncation_no_progress`

Base commit: `f1c127e99cf69db0d55436d124fc80f895656783`

## Objective

Evaluate whether an opt-in `CSVCMsg_PacketEntities.entityData` boundary
truncation mode can end replay_010 packet ordinal 953 before loops 27-29 are
treated as semantic entries, then continue beyond the original missing entity
2905 failure without changing default parser behavior or emitting match facts.

## Result

- Default pass without truncation still reproduced
  `Unable to find an entity with index [ 2905 ]`.
- Guard pass reproduced the Task 119 fail-closed boundary at packet 953 loop
  27 after-index.
- Truncation pass used `allowEntityPacketBoundaryTruncation: true`, with no
  missing-entity recovery and no missing-baseline recovery.
- Truncation triggered before the loop 27 index read:
  - packet ordinal 953;
  - loop 27;
  - read count 5343;
  - `entityDataBitLength` 5344;
  - one remaining bit;
  - three entries skipped by truncation.
- Loops 27-29 were not applied as semantic updates by the truncation pass.
- The truncation pass still reached the original missing entity 2905 failure,
  so the evaluated structural truncation did not advance past the Task 105
  failure.

## Files Created

- `tools/evaluate-replay-010-packet-entities-boundary-truncation.mjs`
- `tests/packet-entities-boundary-truncation.test.mjs`
- `output/local-replay-processing/replay_010-packet-entities-boundary-truncation/`
- `reports/local-replay-packet-entities-boundary-truncation.md`

## Engine Change

Added the opt-in recovery flag `allowEntityPacketBoundaryTruncation`. The flag
is disabled by default. When enabled, the handler can end a packet before
reading a new entry header if the remaining `entityData` bits cannot hold the
minimum local entry header. It does not create entities, materialize fields,
skip missing entity payloads, or alter default parser behavior.

## Non-Claims

This task does not conclude Source 2 semantics, replay corruption, parser bug,
or final parser fix. The result is bounded negative evidence for this specific
truncation hypothesis.

## Protections

Replay 005, bot fixtures 006-008, candidates 011-020, `samples/**`, and
`output/replays/**` were not processed. No raw replay bytes, raw entityData,
raw serializedEntities, raw payloads, string bytes, string values, field
values, full send-table payloads, `.dem`, or `.local` files were committed.

## Follow-Up

No Task 121 was created.
