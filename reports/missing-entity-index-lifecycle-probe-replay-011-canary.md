# Task 138 - Index Lifecycle Probe Replay 011 Canary

Gate: `missing_entity_index_lifecycle_probe_replay_011_canary_ready`

Task 138 ran a replay_011-only canary with the existing
`recovery.diagnoseMissingEntityFailClosed: true` mode after Task 136 extended
that diagnostic with index/lifecycle probe metadata.

The default pass still reaches the known missing entity error:

`Unable to find an entity with index [ 5624 ]`

The diagnostic pass records one compact `missing_entity_fail_closed`
diagnostic at the real boundary and still throws:

- packet ordinal: 1052
- loop: 28
- operation: UPDATE
- entity index: 5624
- previous entity index: 2681
- index delta: 2942
- payload bits: 133
- classification candidate: `not_determined`

The classification is intentionally conservative. The packet-local cursor
ledger has no prior same-entity entry for entity 5624, but it is not
replay-wide lifecycle evidence and does not prove that the entity never
existed in game.

No recovery, skip mode, placeholder/fake entity, synthetic registry state,
payload skip, update application, continuation, canonical facts, source
artifacts, match facts, or spatial/macro/mechanics/fight/decision/ML outputs
were produced. No raw replay bytes, raw payloads, raw entityData,
raw serializedEntities, string bytes/values, field values, or full send-table
payloads were versioned.

Only replay_011 was processed.
