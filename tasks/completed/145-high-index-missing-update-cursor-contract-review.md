# Task 145 - Review High-Index Missing UPDATE Cursor Contract

Status: completed

Gate: `high_index_missing_update_cursor_contract_reviewed`

Commit message: `Review high-index missing UPDATE cursor contract`

## Summary

Consolidated compact Task 143 replay_010 and Task 144 replay_011 outputs and
statically reviewed the local PacketEntities index, cursor, command, and
payloadBits contract.

No replay was processed. No parser/engine behavior was modified. No diagnostic
implementation, recovery, skip mode, placeholder, parser fix, continuation,
default behavior change, new opt-in, or canonical/source/match output was
created.

## Shared Pattern

Both canaries reached fail-closed missing UPDATE boundaries with zero compact
prior local-parser events for the target entity:

- replay_010: packet 954 loop 33, UPDATE entity 2905, previousEntityIndex 2717,
  indexDelta 187, `totalCompactEventsForTarget: 0`,
  `never_registered_in_observed_parser_history_candidate`.
- replay_011: packet 1052 loop 28, UPDATE entity 5624, previousEntityIndex
  2681, indexDelta 2942, `totalCompactEventsForTarget: 0`,
  `index_stream_or_cursor_contract_suspected`.

The replay_011 high delta is a strong local suspicion signal, but not proof of
a parser bug, Source 2 semantics, replay corruption, or local parser
correctness.

## Contract Review

Local PacketEntities handling:

- reads `indexDelta` with `readUVarInt`;
- accumulates `entityIndex = previousEntityIndex + indexDelta + 1`;
- reads a two-bit command with `readBitsAsUInt(2)`;
- maps command ids 0/1/2/3 to UPDATE/LEAVE/CREATE/DELETE;
- requires UPDATE target entity to exist in the local registry.

An earlier cursor error could affect both `indexDelta` and command decoding.
`payloadBits` is compact per-entry metadata from `serializedEntities`, but is
not established as a universal skip/cursor contract.

## Hypothesis Result

Strengthened:

- `command_decode_or_cursor_alignment_candidate`
- `index_accumulation_bug_candidate`, as unproven suspicion
- `never_registered_in_observed_parser_history_pattern`

Weakened:

- `create_register_path_gap_candidate`
- `registry_state_loss_candidate`

Still open:

- `payload_bits_skip_contract_candidate`
- `source_semantics_unknown_candidate`
- `not_enough_parser_evidence`, narrowed to cursor/index-specific gaps

## Recommendation

Selected exactly one next action:

`design_cursor_index_contract_probe_spec`

This should be a non-implementing spec. If a later probe is separately
authorized, it should be fail-closed, compact-only, one replay per task, and
should not capture raw payloads or field values.

## Outputs

- `output/local-replay-processing/high-index-missing-update-cursor-contract-review/shared-pattern-summary.json`
- `output/local-replay-processing/high-index-missing-update-cursor-contract-review/replay-010-011-comparison.json`
- `output/local-replay-processing/high-index-missing-update-cursor-contract-review/index-delta-analysis.json`
- `output/local-replay-processing/high-index-missing-update-cursor-contract-review/cursor-command-contract-map.json`
- `output/local-replay-processing/high-index-missing-update-cursor-contract-review/payloadbits-contract-review.json`
- `output/local-replay-processing/high-index-missing-update-cursor-contract-review/hypothesis-status.json`
- `output/local-replay-processing/high-index-missing-update-cursor-contract-review/evidence-gap-analysis.json`
- `output/local-replay-processing/high-index-missing-update-cursor-contract-review/decision-matrix.json`
- `output/local-replay-processing/high-index-missing-update-cursor-contract-review/recommended-next-action.json`
- `output/local-replay-processing/high-index-missing-update-cursor-contract-review/rejected-fixes.json`
- `output/local-replay-processing/high-index-missing-update-cursor-contract-review/protection-audit.json`
- `output/local-replay-processing/high-index-missing-update-cursor-contract-review/review-gate.json`
- `reports/high-index-missing-update-cursor-contract-review.md`

## Protections

- No replay was processed.
- Replay 005, replays 006-008, replay_010, replay_011, candidates 012-020,
  `samples/**`, and `output/replays/**` were not processed.
- Parser/engine and `packages/deadem/**` were not modified.
- No Java, Clarity, external parser, WSL, iaflow, or Product Reviewer
  automation was used.
- No raw replay bytes, raw payloads, raw entityData, raw serializedEntities,
  string bytes, string values, field values, or full send-table payload were
  versioned.
- Task 146 was not created.
