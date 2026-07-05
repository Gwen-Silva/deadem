# Task 114: Investigate Loop 26 FieldPath 59 Decoder Contract

Status: completed

Gate: `local_replay_loop_26_fieldpath_59_decoder_contract_investigated`

## Objective

Investigate whether replay_010 packet ordinal 953 loop 26 field path 59
`m_nAvailableHelperCount` receiving `decodeString` with `MISC` storage is
coherent with the local serializer/decoder contract, without parser fixes,
recovery, field values, canonical package generation, or factual match output.

## Result

- Default replay_010 behavior still reproduced the Task 105 missing-entity
  failure.
- Diagnostic mode still failed closed at the same missing entity without
  recovery.
- Task 113 numbers matched exactly: field path 59 remained the largest segment,
  `288` bits, `decodeString`, `MISC`, serializer
  `CCitadel_Ability_Familiar_HelpingHands`.
- Local source inventory confirmed that `FieldDecoderType.STRING` resolves to
  `decodeString` and `FieldStorageDescriptor.MISC`.
- Local source/proto search did not find an authoritative static declaration
  for `m_nAvailableHelperCount` or the target serializer.
- The name/decoder pair is suspicious by convention, but this task did not
  conclude a parser bug, Source 2 semantic fact, replay corruption, or safe
  recovery.

## Artifacts

- `tools/investigate-replay-010-loop-26-fieldpath-59-decoder-contract.mjs`
- `tests/loop-26-fieldpath-59-decoder-contract.test.mjs`
- `output/local-replay-processing/replay_010-loop-26-fieldpath-59-decoder-contract/`
- `reports/local-replay-loop-26-fieldpath-59-decoder-contract.md`

## Protections

Replay 005 was not read, opened, hashed, copied, or processed. Replays 006-008
and candidates 011-020 were not processed. No `samples/**`, `output/replays/**`,
raw replay bytes, raw entityData, raw serializedEntities, raw payloads, field
values, snapshots, registries, factual events, source artifacts, canonical
package, spatial data, mechanics, fights, macro, decisions, or ML outputs were
emitted.

No Task 115 was created.
