# Task 122 — Diagnose Entity Index Allocation Gap

Status: completed

Gate: `local_replay_entity_index_allocation_gap_diagnosed`

Base commit: `12cc10dc753222f58c0a443f0404f796ec3b5765`

## Objective

Diagnose why replay_010 references entity 2905 as an UPDATE in packet 954 even
though the local parser did not observe a prior CREATE/register path for that
entity.

## Work Completed

- Added opt-in `diagnoseEntityIndexAllocation` diagnostics, disabled by
  default.
- Recorded compact CREATE/UPDATE/DELETE/LEAVE metadata for range 2880-2920 and
  CREATE context outside the range.
- Added `tools/diagnose-replay-010-entity-index-allocation-gap.mjs`.
- Added compact summary outputs under
  `output/local-replay-processing/replay_010-entity-index-allocation-gap/`.
- Added report `reports/local-replay-entity-index-allocation-gap.md`.
- Added synthetic and output validation coverage in
  `tests/entity-index-allocation-gap.test.mjs`.

## Result

- Default behavior still reproduces `Unable to find an entity with index [
  2905 ]`.
- Allocation diagnostic and truncation+allocation diagnostic passes use no
  missing-entity recovery and no missing-baseline recovery.
- Indexes 2897-2902 were observed as CREATE/register entries before the
  failure.
- Indexes 2903-2910 remain an allocation gap except for the packet 954 loop 33
  missing UPDATE reference to 2905.
- Entity 2905 has no observed CREATE, registerEntity attempt, class lookup,
  baseline lookup, or earlier failure stage.
- Packet 954 remains locally bounded; the jump to 2905 is large but monotonic
  in the local window.
- Packet 953 truncation does not change the allocation/provenance evidence.
- Bounded classification:
  `never_registered_entity_with_create_gap`.

## Limits

- No parser default behavior changed.
- No recovery was added or promoted.
- No placeholder entity, fake fields, canonical package, source artifact,
  factual event, spatial semantic, mechanic, combat, macro, decision, or ML
  output was produced.
- No raw replay bytes, raw entityData, raw serializedEntities, raw payloads,
  string bytes, string values, field values, full raw send-table payload, `.dem`,
  or `.local` content was committed.
- No Source 2 semantic conclusion, replay corruption conclusion, causal
  certainty, or final parser fix is claimed.
- No Task 123 was created.
