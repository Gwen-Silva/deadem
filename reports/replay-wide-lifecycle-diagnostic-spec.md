# Task 140 - Replay-Wide Lifecycle Diagnostic Spec

Gate: `replay_wide_lifecycle_diagnostic_spec_ready`

Task 140 prepared a bounded, non-implementing spec for a future replay-wide lifecycle/registry diagnostic for the repeated `missing_entity_fail_closed` class.

No replay was processed. No parser, engine, or `packages/deadem/**` file was modified. No diagnostic implementation, recovery, skip mode, placeholder entity, parser fix, new opt-in option, default behavior change, canonical output, source artifact, or match fact was created.

## Problem

Tasks 137 and 138 ran packet-local lifecycle probes:

- replay_010: packet 954 loop 33 UPDATE entity 2905, `classificationCandidate: not_determined`.
- replay_011: packet 1052 loop 28 UPDATE entity 5624, `classificationCandidate: not_determined`.

Task 139 concluded that packet-local evidence cannot decide replay-wide create/register/removal provenance or index-stream cause.

## Selected Alternative

Selected alternative:

`design_replay_wide_entity_lifecycle_ledger`

This route is spec-only. It defines a future diagnostic evidence surface but requires separate human approval before any implementation or replay processing.

## Future Diagnostic Boundary

A future implementation, if separately approved, would collect compact parser-local lifecycle metadata from parser load to the first missing entity boundary. It would still throw fail-closed at the same boundary, with no continuation, recovery, skip, placeholder, fake fields, synthetic registry state, or default behavior change.

Permitted classifications remain diagnostic candidates only:

- `never_registered_in_observed_parser_history_candidate`
- `created_then_missing_registry_state_candidate`
- `removed_before_missing_update_candidate`
- `entity_index_reused_or_generation_ambiguous_candidate`
- `index_stream_or_cursor_contract_suspected`
- `not_determined`

They are not game facts, Source 2 semantics, replay corruption conclusions, or proof of local parser correctness.

## Required Approval

Human approval is still required before:

- implementing any replay-wide lifecycle ledger;
- processing replay_010 or replay_011 again;
- touching parser/engine diagnostic hooks;
- running any canary task.

Replay 005, bot fixtures 006-008, candidates 012-020, `samples/**`, and `output/replays/**` remain out of scope.
