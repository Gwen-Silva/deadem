# Replay-Wide Lifecycle Diagnostic Replay 011 Canary

Task: 144

Gate: `replay_wide_lifecycle_diagnostic_replay_011_canary_ready`

## Scope

This task ran only the authorized `replay_011` canary with the existing
disabled-by-default `recovery.diagnoseMissingEntityFailClosed` diagnostic. It
did not process `replay_010`, replay 005, bot fixtures 006-008, candidates
012-020, `samples/**`, or `output/replays/**`.

The diagnostic used only:

```json
{
  "recovery": {
    "diagnoseMissingEntityFailClosed": true
  }
}
```

No recovery, skip mode, placeholder entity, fake fields, synthetic registry
state, continuation after failure, default behavior change, or new opt-in was
introduced.

## Boundary

Default and diagnostic passes both reproduced:

`Unable to find an entity with index [ 5624 ]`

The diagnostic boundary is:

- packet ordinal: `1052`
- loop: `28`
- operation: `UPDATE`
- entity index: `5624`
- previous entity index: `2681`
- index delta: `2942`
- payload bits: `133`
- entityDataBitLength: `5848`
- read counts: beforeIndex `5212`, afterIndex `5226`, afterCommand `5228`, afterAction `5228`

The parser failed closed at the boundary. It did not continue, apply the
missing update, skip payload, materialize fields, or create placeholder/fake
state.

## Lifecycle Ledger

The replay-wide/local-parser ledger tracked `41408` compact events before the
boundary. It tracked `0` compact prior events for target entity `5624`.

For entity `5624`, no compact local-parser evidence before the boundary showed:

- CREATE
- register attempt
- register success
- prior UPDATE
- DELETE or LEAVE
- class lookup
- baseline lookup
- field extraction
- repeated index or serial/generation ambiguity

The classification is:

`index_stream_or_cursor_contract_suspected`

Confidence: `low`

This is local diagnostic evidence only. It does not prove a parser bug, Source
2 semantics, replay corruption, local parser correctness, or that entity 5624
never existed in the game.

## Replay 010 Comparison

Task 143 replay_010 produced `never_registered_in_observed_parser_history_candidate`
for entity 2905 with `4852` compact events tracked and `0` target events.

Task 144 replay_011 repeats the same broad pattern of an UPDATE for an entity
index with zero compact prior local-parser target events. It differs because
replay_011 has a large `indexDelta` of `2942`, which strengthens local
cursor/index-contract suspicion.

## Hypotheses

Strengthened:

- `command_decode_or_cursor_alignment_candidate`
- `index_stream_or_cursor_contract_suspected`
- no observed local-parser target history before boundary

Weakened:

- `create_register_path_gap_candidate`
- `registry_state_loss_candidate`
- `class_or_baseline_pre_register_failure_candidate_for_entity_5624`
- `delete_leave_semantics_gap_candidate`
- `removed_before_missing_update_candidate`
- `entity_index_reused_or_generation_ambiguous_candidate`

Still open:

- `source_semantics_unknown_candidate`
- `payload_bits_skip_contract_candidate`

## Protections

No raw replay bytes, raw payloads, raw entityData, raw serializedEntities,
string bytes, string values, field values, or full send-table payload were
versioned. No canonical/source/match/spatial/macro/mechanics/fight/decision/ML
output was produced.

Next evidence should review the shared high-index missing UPDATE pattern across
replay_010 and replay_011 before any parser intervention. This canary alone
does not authorize recovery, skip mode, or parser fixes.
