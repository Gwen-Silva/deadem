# Task 109: Diagnose Serialized Entity Payload Semantics For Replay 010 Missing-Update Recovery

Status: completed

Gate: `local_replay_serialized_entity_payload_semantics_diagnosed`

Base commit: `e1ab0fda0fd2e6e7cbc76c72fd2085afb5b9c2e1`

## Objective

Diagnose whether values decoded from `CSVCMsg_PacketEntities.serializedEntities`
by `EntityPayloadSizeExtractor` can be treated as direct bit counts to skip
after index + command for missing UPDATE recovery in the authorized
`replay_010` canary.

## Scope

- Processed only `.local/deadem/replays/inbox/partida_010.dem`.
- Reproduced default parser behavior.
- Re-ran opt-in missing-entity recovery plus opt-in cursor diagnostics only to
  the Task 107/108 boundary.
- Emitted compact diagnostic summaries only.

## Observed Facts

- Default behavior still failed after 953 advanced ticks with
  `Unable to find an entity with index [ 2905 ]`.
- Opt-in recovery still advanced past the Task 105 boundary to tick 2862 and
  stopped on `entity index out of range`.
- The Task 107/108 boundary packet was captured through loop 23.
- Boundary packet loops 18-23 were included in the committed summary.
- Loop 21 was a present UPDATE with `payloadBits` 227 and after-command
  extractor consumption of 363 bits.
- Loop 22 was a missing UPDATE for entity 6679 with `payloadBits` 266 and
  action `skipped_missing_update_payload`.
- Loop 23 was the out-of-range CREATE with entity index 570655505, class ID
  139, serial 35052, and class `CCitadel_Ability_Frank_ShockTarget2`.

## Numerical Comparisons

- Present UPDATE entries before the boundary in the boundary packet: 22.
- Present UPDATE entries where `payloadBits` matched after-command
  consumption: 21.
- Present UPDATE after-command mismatches: 1.
- Confirmed mismatch before loop 22: loop 21.
- Tested references ranked after-command as closest for the present UPDATE
  entries in the captured boundary packet.

## Interpretation Boundary

`payloadBits` is classified as unsafe as direct missing-UPDATE skip input for
now. This does not prove that loop 22 caused the loop 23 boundary. Loop 22
remains arithmetic-only evidence because the missing entity prevented
independent extractor consumption for that entry.

## Not Determined

- Exact `serializedEntities` proto semantics.
- Whether `EntityPayloadSizeExtractor` is decoding the correct varint stream
  but comparing against the wrong reference frame.
- Whether loop 22 caused the out-of-range CREATE boundary.
- Whether earlier packets show the same mismatch pattern.

## Outputs

- `output/local-replay-processing/replay_010-serialized-entity-payload-semantics/input-identity.json`
- `output/local-replay-processing/replay_010-serialized-entity-payload-semantics/default-pass-result.json`
- `output/local-replay-processing/replay_010-serialized-entity-payload-semantics/recovery-boundary-result.json`
- `output/local-replay-processing/replay_010-serialized-entity-payload-semantics/boundary-packet-payload-consumption-summary.json`
- `output/local-replay-processing/replay_010-serialized-entity-payload-semantics/payload-size-consistency-summary.json`
- `output/local-replay-processing/replay_010-serialized-entity-payload-semantics/payload-semantics-hypotheses.json`
- `output/local-replay-processing/replay_010-serialized-entity-payload-semantics/protection-audit.json`
- `output/local-replay-processing/replay_010-serialized-entity-payload-semantics/replay-specific-branch-audit.json`
- `output/local-replay-processing/replay_010-serialized-entity-payload-semantics/payload-semantics-gate.json`
- `reports/local-replay-serialized-entity-payload-semantics.md`

Full verbose ledger:

- `.local/deadem/cache/local-replay-processing/replay_010/serialized-entity-payload-semantics/serialized-entity-payload-consumption-ledger-full.json`
- Commit policy: local only.

## Protections

- Replay 005 was not read, hashed, copied, opened, inspected, or processed.
- Replays 006-008 were not processed.
- Candidates 011-020 were not touched.
- `samples/**` and `output/replays/**` were not used.
- No replay bytes, raw `entityData`, raw `serializedEntities`, field values, or
  `.dem` files were committed.
- No canonical package, source artifact, snapshot, registry, factual event,
  spatial output, mechanic effect, fight, macro, decision, or ML output was
  emitted.
- No fake entity, placeholder entity, field materialization, index-limit
  increase, or automatic recovery was added.
- Task 110 was not created.

## Validation

- `node tools/diagnose-replay-010-serialized-entity-payload-semantics.mjs ...`
- `node --test tests/serialized-entity-payload-semantics-diagnosis.test.mjs`
- `node --test tests/entity-packet-cursor-alignment-diagnosis.test.mjs`
- `node --test tests/out-of-range-entity-create-diagnosis.test.mjs`
- `node --test tests/missing-entity-recovery-canary.test.mjs`
- `npm run validate:tasks`
- `npm run lint`
- `npm run check:outputs` with only the known pre-existing
  `output/04-controller-pawn-lifecycle.json` size warning allowed.

## Recommended Next Human Decision

Choose whether to investigate `EntityPayloadSizeExtractor`, the
`serializedEntities` proto semantics, extractor-consumption accounting, or to
pause missing-entity skip as an unsafe recovery path for now.
