# Task 171 - Allowlisted Death Validation Batch Parity

Status: completed

Gate: `allowlisted_death_validation_batch_parity_emitted`

Commit base: `18702921799dc48e9c03e0a67446056ae44c5ef2`

## Summary

Task 171 added `tools/emit-allowlisted-death-validation-batch-artifacts.mjs`, a
manifest-driven compact `death_validation` batch runner. The runner validates
manifest allowlists before filesystem access, blocks protected and unsafe replay
inputs, builds artifacts in memory, validates schema, output policy, size, and
Task 168 parity, then writes real artifacts only when all checks pass.

The exact-15 parity manifest is stored at:

`output/local-replay-processing/allowlisted-death-validation-batch-runner/exact-15-parity-manifest.json`

## Processed Replays

Only the 15 allowlisted replays were processed:

- replay_001
- replay_002
- replay_003
- replay_004
- replay_009
- replay_010
- replay_011
- replay_012
- replay_013
- replay_014
- replay_015
- replay_016
- replay_017
- replay_018
- replay_019

`replay_005`, `replay_006`, `replay_007`, `replay_008`, and `replay_020` were
not accessed or processed.

## Parity

Parity against Task 168 passed for replay IDs, `eventCount`,
`duplicateKeyCount`, and `validationStatus`.

| Replay | eventCount | duplicateKeyCount | validationStatus |
| --- | ---: | ---: | --- |
| replay_001 | 109 | 0 | source_events_available_with_limitations |
| replay_002 | 53 | 0 | source_events_available_with_limitations |
| replay_003 | 117 | 0 | source_events_available_with_limitations |
| replay_004 | 58 | 0 | source_events_available_with_limitations |
| replay_009 | 84 | 0 | source_events_available_with_limitations |
| replay_010 | 45 | 0 | source_events_available_with_limitations |
| replay_011 | 80 | 0 | source_events_available_with_limitations |
| replay_012 | 81 | 0 | source_events_available_with_limitations |
| replay_013 | 68 | 0 | source_events_available_with_limitations |
| replay_014 | 77 | 0 | source_events_available_with_limitations |
| replay_015 | 102 | 0 | source_events_available_with_limitations |
| replay_016 | 73 | 0 | source_events_available_with_limitations |
| replay_017 | 89 | 0 | source_events_available_with_limitations |
| replay_018 | 103 | 0 | source_events_available_with_limitations |
| replay_019 | 60 | 0 | source_events_available_with_limitations |

`eventCount` remains a source-observed counter transition candidate count, not a
final death fact.

## Outputs

- `output/local-replay-processing/allowlisted-death-validation-batch-runner/exact-15-parity-manifest.json`
- `output/local-replay-processing/allowlisted-death-validation-batch-parity/allowlisted-batch-gate.json`
- `output/local-replay-processing/allowlisted-death-validation-batch-parity/allowlisted-batch-summary.json`
- `output/local-replay-processing/allowlisted-death-validation-batch-parity/per-replay-emission-status.json`
- `output/local-replay-processing/allowlisted-death-validation-batch-parity/schema-validation-summary.json`
- `output/local-replay-processing/allowlisted-death-validation-batch-parity/output-policy-audit.json`
- `output/local-replay-processing/allowlisted-death-validation-batch-parity/size-audit.json`
- `output/local-replay-processing/allowlisted-death-validation-batch-parity/protection-audit.json`
- `output/local-replay-processing/allowlisted-death-validation-batch-parity/blocked-replay-audit.json`
- `output/local-replay-processing/allowlisted-death-validation-batch-parity/parity-comparison-summary.json`
- `output/local-replay-processing/allowlisted-death-validation-batch-parity/artifacts/*/death_validation.json`
- `reports/allowlisted-death-validation-batch-parity.md`

## Protections

No artifact outside `death_validation`, death events, respawn events, timelines,
objective lifecycle, player identity rows, attribution, field values, raw data,
snapshots, source/canonical/match final facts, gameplay interpretation, parser
or engine behavior change, `packages/deadem/**` change, recovery, skip,
placeholder, default behavior change, parser opt-in, Java/Clarity/external
parser, WSL, iaflow, Product Reviewer automation, pull/merge/cherry-pick/rebase,
or Task 172 was produced.
