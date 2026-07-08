# Task 143 - Run Replay-Wide Lifecycle Diagnostic Replay 010 Canary

Status: completed

Gate: `replay_wide_lifecycle_diagnostic_replay_010_canary_ready`

Task 143 ran only the authorized `replay_010` canary with the existing
`recovery.diagnoseMissingEntityFailClosed` mode. The run stopped fail-closed at
the expected missing entity boundary:

- packetOrdinal: `954`
- loop: `33`
- operation: `UPDATE`
- entityIndex: `2905`
- previousEntityIndex: `2717`
- indexDelta: `187`
- payloadBits: `193`

The replay-wide lifecycle ledger tracked `4852` compact local-parser events
before the boundary and `0` compact events for entity `2905`.

Observed classification:

`never_registered_in_observed_parser_history_candidate`

This is explicitly limited to local parser diagnostic evidence and does not
claim the entity never existed in game, Source 2 semantics, replay corruption,
or local parser correctness.

Artifacts:

- `output/local-replay-processing/replay-wide-lifecycle-diagnostic-replay-010-canary/default-behavior-comparison.json`
- `output/local-replay-processing/replay-wide-lifecycle-diagnostic-replay-010-canary/replay-010-ledger-result.json`
- `output/local-replay-processing/replay-wide-lifecycle-diagnostic-replay-010-canary/missing-entity-boundary-diagnostic.json`
- `output/local-replay-processing/replay-wide-lifecycle-diagnostic-replay-010-canary/lifecycle-ledger-summary.json`
- `output/local-replay-processing/replay-wide-lifecycle-diagnostic-replay-010-canary/lifecycle-classification-result.json`
- `output/local-replay-processing/replay-wide-lifecycle-diagnostic-replay-010-canary/hypothesis-evidence-result.json`
- `output/local-replay-processing/replay-wide-lifecycle-diagnostic-replay-010-canary/no-continuation-proof.json`
- `output/local-replay-processing/replay-wide-lifecycle-diagnostic-replay-010-canary/protection-audit.json`
- `output/local-replay-processing/replay-wide-lifecycle-diagnostic-replay-010-canary/canary-gate.json`
- `reports/replay-wide-lifecycle-diagnostic-replay-010-canary.md`

No parser/engine behavior was modified. No recovery, skip mode, placeholder,
continuation, default behavior change, new opt-in, canonical/source/match
output, raw replay data, field values, external parser, WSL, iaflow, Product
Reviewer automation, or Task 144 was created.
