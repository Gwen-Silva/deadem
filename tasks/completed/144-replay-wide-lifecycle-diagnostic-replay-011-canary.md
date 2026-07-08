# Task 144 - Run Replay-Wide Lifecycle Diagnostic Replay 011 Canary

Status: completed

Gate: `replay_wide_lifecycle_diagnostic_replay_011_canary_ready`

Commit message: `Run replay-wide lifecycle diagnostic replay 011 canary`

## Summary

Ran the existing replay-wide/local-parser lifecycle ledger on authorized
`replay_011` only, using only:

```json
{
  "recovery": {
    "diagnoseMissingEntityFailClosed": true
  }
}
```

Default and diagnostic passes both reproduced:

`Unable to find an entity with index [ 5624 ]`

The diagnostic boundary matched the expected packet-local probe:

- packet ordinal: `1052`
- loop: `28`
- operation: `UPDATE`
- entity index: `5624`
- previous entity index: `2681`
- indexDelta: `2942`
- payloadBits: `133`
- entityDataBitLength: `5848`

The parser failed closed. It did not continue, apply the missing update, skip
payload, materialize fields, or create placeholder/fake/synthetic state.

## Lifecycle Result

The compact ledger tracked `41408` local-parser lifecycle events before the
boundary and `0` events for target entity `5624`.

No CREATE, register attempt, register success, prior UPDATE, DELETE/LEAVE,
class lookup, baseline lookup, or field extraction was observed for entity
`5624` before the boundary.

Classification:

`index_stream_or_cursor_contract_suspected`

The classification is low-confidence local parser diagnostic evidence only. It
does not prove Source 2 semantics, replay corruption, local parser correctness,
or that entity 5624 never existed in game.

## Replay 010 Comparison

Task 143 replay_010 had zero compact target events for entity 2905 and
classification `never_registered_in_observed_parser_history_candidate`.

Replay_011 repeats the broad zero-target-history missing UPDATE pattern, but
its large `indexDelta` of `2942` makes the cursor/index-contract hypothesis
stronger than in replay_010.

## Protections

- Only `replay_011` was processed.
- The replay_010 replay file was not accessed or processed; versioned compact
  Task 143 outputs were read for comparison.
- Replay 005, replays 006-008, candidates 012-020, `samples/**`, and
  `output/replays/**` were not accessed or processed.
- Parser/engine behavior and `packages/deadem/**` were not modified.
- No recovery, skip mode, placeholder, continuation, default behavior change,
  new opt-in, canonical/source/match output, Java, Clarity, external parser,
  WSL, iaflow, or Product Reviewer automation was used.
- No raw replay bytes, raw payloads, raw entityData, raw serializedEntities,
  string bytes, string values, field values, or full send-table payload were
  versioned.
- Task 145 was not created.

## Outputs

- `output/local-replay-processing/replay-wide-lifecycle-diagnostic-replay-011-canary/default-behavior-comparison.json`
- `output/local-replay-processing/replay-wide-lifecycle-diagnostic-replay-011-canary/replay-011-ledger-result.json`
- `output/local-replay-processing/replay-wide-lifecycle-diagnostic-replay-011-canary/missing-entity-boundary-diagnostic.json`
- `output/local-replay-processing/replay-wide-lifecycle-diagnostic-replay-011-canary/lifecycle-ledger-summary.json`
- `output/local-replay-processing/replay-wide-lifecycle-diagnostic-replay-011-canary/lifecycle-classification-result.json`
- `output/local-replay-processing/replay-wide-lifecycle-diagnostic-replay-011-canary/hypothesis-evidence-result.json`
- `output/local-replay-processing/replay-wide-lifecycle-diagnostic-replay-011-canary/replay-010-comparison.json`
- `output/local-replay-processing/replay-wide-lifecycle-diagnostic-replay-011-canary/no-continuation-proof.json`
- `output/local-replay-processing/replay-wide-lifecycle-diagnostic-replay-011-canary/protection-audit.json`
- `output/local-replay-processing/replay-wide-lifecycle-diagnostic-replay-011-canary/canary-gate.json`
- `reports/replay-wide-lifecycle-diagnostic-replay-011-canary.md`
