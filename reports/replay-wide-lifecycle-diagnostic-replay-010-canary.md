# Replay-Wide Lifecycle Diagnostic Replay 010 Canary

Task 143 ran the existing diagnostic fail-closed replay-wide/local-parser
lifecycle ledger on the authorized `replay_010` canary only.

Gate: `replay_wide_lifecycle_diagnostic_replay_010_canary_ready`

## Boundary

Default and diagnostic passes both reproduced:

`Unable to find an entity with index [ 2905 ]`

The diagnostic boundary matched the expected prior context:

- packetOrdinal: `954`
- loop: `33`
- operation: `UPDATE`
- entityIndex: `2905`
- previousEntityIndex: `2717`
- indexDelta: `187`
- payloadBits: `193`

The parser threw at the boundary and did not continue.

## Ledger Result

The replay-wide local-parser ledger tracked `4852` compact events before the
boundary. It recorded `0` compact events for entity `2905`.

Observed classification:

`never_registered_in_observed_parser_history_candidate`

This means only that entity `2905` was not observed in the local parser history
before the missing UPDATE. It does not mean the entity never existed in game.

## Hypothesis Impact

Strengthened:

- local evidence narrowed to no observed target history before the boundary.

Weakened for entity `2905` in replay_010:

- `create_register_path_gap_candidate`
- `registry_state_loss_candidate`
- `delete_leave_semantics_gap_candidate`
- `class_or_baseline_pre_register_failure_candidate`
- `entity_index_reused_or_generation_ambiguous_candidate`

Still open:

- `command_decode_or_cursor_alignment_candidate`
- `payload_bits_skip_contract_candidate`
- `source_semantics_unknown_candidate`

## Protections

Only `replay_010` was processed. No replay_011, replay 005, bot fixture,
candidate replay, sample, or `output/replays/**` path was processed. No
parser/engine behavior was changed. No recovery, skip mode, placeholder, fake
field, synthetic registry state, continuation, new opt-in, default behavior
change, canonical/source/match output, raw payload, field value, Java, Clarity,
external parser, WSL, iaflow, Product Reviewer automation, or Task 144 was
created.
