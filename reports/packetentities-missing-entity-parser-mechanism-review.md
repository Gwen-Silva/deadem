# PacketEntities Missing Entity Parser Mechanism Review

Task 142 reviewed the local parser mechanism around `missing_entity_fail_closed`
without processing replays and without changing parser behavior.

Gate: `packetentities_missing_entity_parser_mechanism_reviewed`

## Mechanism Summary

`handleSvcPacketEntities` accumulates `entityIndex` from `startIndex` using
`readUVarInt() + 1`, then reads a two-bit command mapped as `UPDATE`, `LEAVE`,
`CREATE`, or `DELETE`. `UPDATE`, `LEAVE`, and `DELETE` all require an entity
already present in the local registry. `CREATE` may construct an entity, but
direct registration happens only after class and baseline checks on the allowed
path, or later through `DemoEntityHandler` in event mode.

`payloadBits` are decoded from `serializedEntities` for diagnostics, filtering,
and bounded skip/recovery paths. Normal unfiltered mutation parsing advances
through `EntityMutationExtractor`, so `payloadBits` must not be treated as a
universal cursor contract without more evidence.

## Highest-Value Hypotheses

- `create_register_path_gap_candidate`: a target CREATE could fail or defer
  registration before the later missing UPDATE.
- `registry_state_loss_candidate`: a target could be registered and later
  removed or overwritten in local registry state.
- `command_decode_or_cursor_alignment_candidate`: cursor/index/command
  interpretation could produce an UPDATE for an unintended index.
- `not_enough_parser_evidence`: current real-canary evidence is still
  packet-local; Task 141's replay-wide ledger has only synthetic validation.

No hypothesis is promoted to a parser bug, Source 2 semantic, replay corruption
claim, or game fact.

## Recommended Next Evidence

Run the existing Task 141 diagnostic fail-closed replay-wide lifecycle ledger on
one authorized canary at a time, starting with replay_010, without recovery,
skip mode, placeholder, continuation, parser behavior changes, or raw data
capture.

## Protections

No replay was processed. No parser/engine behavior was modified. No new
diagnostic, recovery, skip mode, placeholder, new opt-in, default behavior
change, canonical/source/match output, raw payload, field value, or Task 143 was
created.
