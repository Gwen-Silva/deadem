# Task 137 - Index Lifecycle Probe Replay 010 Canary

Gate: `missing_entity_index_lifecycle_probe_replay_010_canary_ready`

Task 137 ran a replay_010-only canary with the existing
`recovery.diagnoseMissingEntityFailClosed: true` mode after Task 136 extended
that diagnostic with index/lifecycle probe metadata.

The default pass still reaches the known missing entity error:

`Unable to find an entity with index [ 2905 ]`

The diagnostic pass records one compact `missing_entity_fail_closed`
diagnostic at the real boundary and still throws:

- packet ordinal: 954
- loop: 33
- operation: UPDATE
- entity index: 2905
- previous entity index: 2717
- index delta: 187
- payload bits: 193
- classification candidate: `not_determined`

The classification is intentionally conservative. The packet-local cursor
ledger has no prior same-entity entry for entity 2905, but it is not
replay-wide lifecycle evidence and does not prove that the entity never
existed in game.

No recovery, skip mode, placeholder/fake entity, synthetic registry state,
payload skip, update application, continuation, canonical facts, source
artifacts, match facts, or spatial/macro/mechanics/fight/decision/ML outputs
were produced. No raw replay bytes, raw payloads, raw entityData,
raw serializedEntities, string bytes/values, field values, or full send-table
payloads were versioned.

Only replay_010 was processed.
