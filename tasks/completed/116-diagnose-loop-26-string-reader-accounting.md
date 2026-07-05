# Task 116 - Diagnose Loop 26 FieldPath 59 String-Reader Length And Boundary Accounting

Status: completed

Gate: `local_replay_loop_26_string_reader_accounting_diagnosed`

## Objective

Diagnose replay_010 packet ordinal 953 loop 26 field path 59 string-reader and
payload-boundary accounting without field values, string values, string bytes,
parser recovery, parser fixes, canonical package generation, or match facts.

## Result

Default parser behavior still reproduced the Task 105 missing-entity failure at
entity 2905. The opt-in diagnostic pass also failed closed at the same first
missing entity without recovery enabled.

Field path 59 was matched to the Task 113 field-reader segment and Task 115
runtime metadata:

- field name: `m_nAvailableHelperCount`
- runtime varType: `char`
- decoder/storage: `decodeString` / `MISC`
- read-count span: 5055 to 5343
- bits consumed: 288
- bytes consumed: 36
- null terminator observed: true
- bytes before terminator: 35
- stopped because: `null_terminator`

The segment starts 8 bits before the loop 26 `payloadBits` expected end and
ends 280 bits after that boundary. This is metric evidence for a local
payload-boundary or accounting mismatch. Causal conclusion remains
`not_determined`.

## Safety

No field values, string values, string bytes, raw payloads, raw entityData, raw
serializedEntities, full raw send-table payload, canonical package, source
artifact, factual event, snapshot, registry, spatial semantic, mechanic effect,
fight, macro, decision, or ML output was emitted. No recovery was added or
promoted, no fake entity or field was created, and parser default behavior
remains unchanged.

Replay 005, bot fixtures 006-008, candidates 011-020, `samples/**`, and
`output/replays/**` were not used. No Task 117 was created.

## Outputs

- `output/local-replay-processing/replay_010-loop-26-string-reader-accounting/string-reader-gate.json`
- `output/local-replay-processing/replay_010-loop-26-string-reader-accounting/string-reader-segment-summary.json`
- `output/local-replay-processing/replay_010-loop-26-string-reader-accounting/payload-boundary-relation.json`
- `output/local-replay-processing/replay_010-loop-26-string-reader-accounting/string-reader-wellformedness.json`
- `reports/local-replay-loop-26-string-reader-accounting.md`
