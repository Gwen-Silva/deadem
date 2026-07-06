# Task 121 - Macro-Diagnose Entity 2905 Failure

Status: completed

Gate: `local_replay_entity_2905_registry_and_packet_context_diagnosed`

## Objective

Diagnose the replay_010 missing entity 2905 failure across registry lifecycle,
nearby index context, first missing update packet context, and default versus
packet-953 truncation behavior without parser fixes, automatic recovery,
canonicalization, or match facts.

## Result

- Default behavior still reproduced `Unable to find an entity with index [ 2905 ]`.
- Registry diagnostics used no missing-entity recovery and no missing-baseline recovery.
- Truncation plus registry diagnostics also reached the same missing entity 2905 failure.
- Entity 2905 was not observed as created, registered, deleted, left, or deactivated before failure.
- The first known reference to entity 2905 is packet ordinal 954 loop 33, already an UPDATE against missing registry state.
- Nearby indexes 2900-2902 were created and registered normally.
- Packet 954 read counts remained within `entityDataBitLength`; no packet-953-like boundary issue was observed at the missing update.
- Packet 953 truncation did not change entity 2905 registry history.

## Classification

`first_missing_update_to_never_registered_entity`

This is a bounded local parser/registry diagnosis. It does not prove Source 2
semantics, replay corruption, final parser correctness, or causal certainty.

## Files Created

- `tools/diagnose-replay-010-entity-2905-registry-and-packet-context.mjs`
- `tests/entity-2905-registry-and-packet-context.test.mjs`
- `output/local-replay-processing/replay_010-entity-2905-registry-and-packet-context/`
- `reports/local-replay-entity-2905-registry-and-packet-context.md`

## Safety

No raw replay bytes, raw entityData, raw serializedEntities, raw payloads,
string bytes, string values, field values, full raw send-table payload, `.dem`,
or `.local` files were committed. No canonical package, source artifact,
snapshot, registry, factual event, spatial, mechanic, combat, macro, decision,
or ML output was emitted.

No Task 122 was created.
