# Task 173 - Allowlisted Death Validation Batch Mode Smoke

Status: completed

Gate: `allowlisted_death_validation_batch_mode_smoke_ready`

Batch runner gate: `allowlisted_death_validation_batch_emitted`

Commit base: `5bc201f316838fcc8090e622cffdc9cd82141047`

## Summary

Task 173 ran the first real `runnerMode: batch` smoke for the already
authorized exact-15 compact `death_validation` set. The run used:

`output/local-replay-processing/allowlisted-death-validation-batch-runner/exact-15-batch-mode-smoke-manifest.json`

and wrote batch outputs under:

`output/local-replay-processing/allowlisted-death-validation-batches/exact_15_batch_mode_smoke/`

The smoke did not pass `--reference-status`, did not execute parity mode, and
recorded `parityStatus: not_required`.

## Processed Replays

Only these 15 replays were processed:

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

## Compact Counts

| Replay | eventCount | duplicateKeyCount |
| --- | ---: | ---: |
| replay_001 | 109 | 0 |
| replay_002 | 53 | 0 |
| replay_003 | 117 | 0 |
| replay_004 | 58 | 0 |
| replay_009 | 84 | 0 |
| replay_010 | 45 | 0 |
| replay_011 | 80 | 0 |
| replay_012 | 81 | 0 |
| replay_013 | 68 | 0 |
| replay_014 | 77 | 0 |
| replay_015 | 102 | 0 |
| replay_016 | 73 | 0 |
| replay_017 | 89 | 0 |
| replay_018 | 103 | 0 |
| replay_019 | 60 | 0 |

`eventCount` remains a source-observed counter transition candidate count, not a
final death fact.

## Validation

- schema validation: passed
- output policy: passed
- size audit: passed
- parity comparison: not required

## Outputs

- `output/local-replay-processing/allowlisted-death-validation-batch-runner/exact-15-batch-mode-smoke-manifest.json`
- `output/local-replay-processing/allowlisted-death-validation-batch-runner/batch-mode-smoke-gate.json`
- `output/local-replay-processing/allowlisted-death-validation-batch-runner/batch-mode-smoke-summary.json`
- `output/local-replay-processing/allowlisted-death-validation-batch-runner/batch-mode-smoke-protection-audit.json`
- `output/local-replay-processing/allowlisted-death-validation-batches/exact_15_batch_mode_smoke/allowlisted-batch-gate.json`
- `output/local-replay-processing/allowlisted-death-validation-batches/exact_15_batch_mode_smoke/allowlisted-batch-summary.json`
- `output/local-replay-processing/allowlisted-death-validation-batches/exact_15_batch_mode_smoke/per-replay-emission-status.json`
- `output/local-replay-processing/allowlisted-death-validation-batches/exact_15_batch_mode_smoke/schema-validation-summary.json`
- `output/local-replay-processing/allowlisted-death-validation-batches/exact_15_batch_mode_smoke/output-policy-audit.json`
- `output/local-replay-processing/allowlisted-death-validation-batches/exact_15_batch_mode_smoke/size-audit.json`
- `output/local-replay-processing/allowlisted-death-validation-batches/exact_15_batch_mode_smoke/protection-audit.json`
- `output/local-replay-processing/allowlisted-death-validation-batches/exact_15_batch_mode_smoke/blocked-replay-audit.json`
- `output/local-replay-processing/allowlisted-death-validation-batches/exact_15_batch_mode_smoke/parity-comparison-summary.json`
- `output/local-replay-processing/allowlisted-death-validation-batches/exact_15_batch_mode_smoke/artifacts/*/death_validation.json`
- `reports/allowlisted-death-validation-batch-mode-smoke.md`

## Protections

No replay outside the exact-15 batch-mode smoke manifest was processed. No
`death_validation` artifact was emitted for `replay_020`.

No artifact outside `death_validation`, death events, respawn events, timelines,
objective lifecycle, player identity rows, attribution, field values, raw data,
snapshots, full entity histories, source/canonical/match final facts, gameplay
interpretation, parser or engine behavior change, `packages/deadem/**` change,
recovery, skip, placeholder, default behavior change, parser opt-in,
Java/Clarity/external parser, WSL, iaflow, Product Reviewer automation,
pull/merge/cherry-pick/rebase, or Task 174 was produced.
