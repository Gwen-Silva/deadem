# Task 119 - Evaluate Opt-In Fail-Closed EntityData Boundary Guard For PacketEntities

Status: completed

Gate: `local_replay_packet_entities_boundary_guard_diagnosed`

Base commit: `3fcbd16eb420d1ebaf4a6b3495d6236f4fc25889`

## Objective

Evaluate whether an opt-in diagnostic boundary guard for
`CSVCMsg_PacketEntities.entityData` can fail closed at replay_010 packet ordinal
953 loop 27 before the original Task 105 missing entity 2905 failure, without
changing default parser behavior, adding recovery, constructing canonical
packages, or emitting match facts.

## Result

- Default pass without the guard still reproduced
  `Unable to find an entity with index [ 2905 ]`.
- Guard pass with `diagnoseEntityPacketBoundaryGuard: true` stopped with
  `entity packet boundary crossed`.
- Boundary diagnostic matched Task 118:
  - packet ordinal 953;
  - loop 27;
  - violation stage `after_index`;
  - `entityDataBitLength` 5344;
  - `beforeIndexReadCount` 5343;
  - `afterIndexReadCount` 5349;
  - 5 bits beyond the entityData boundary.
- The guarded pass did not reach the original missing entity 2905 failure.
- Loops 27-29 were prevented from continuing as semantic updates in the guarded
  diagnostic pass.

## Files Created

- `tools/evaluate-replay-010-packet-entities-boundary-guard.mjs`
- `tests/packet-entities-boundary-guard.test.mjs`
- `output/local-replay-processing/replay_010-packet-entities-boundary-guard/`
- `reports/local-replay-packet-entities-boundary-guard.md`

## Engine Change

Added the opt-in recovery diagnostic flag
`diagnoseEntityPacketBoundaryGuard`. The flag is disabled by default and records
only diagnostics before throwing fail-closed. It does not skip payloads, create
entities, materialize fields, or alter normal parser behavior.

## Non-Claims

This task does not conclude Source 2 semantics, replay corruption, or a final
parser fix. The guard remains diagnostic-only and opt-in.

## Protections

Replay 005, bot fixtures 006-008, candidates 011-020, `samples/**`, and
`output/replays/**` were not processed. No raw replay bytes, raw entityData,
raw serializedEntities, raw payloads, string bytes, string values, field values,
full send-table payloads, `.dem`, or `.local` files were committed.

## Follow-Up

No Task 120 was created.
