# Task 172 - Allowlisted Death Validation Runner Mode Contract

Status: completed

Gate: `allowlisted_death_validation_runner_mode_contract_ready`

Commit base: `2a966d9eb59af44d69053ad5c43a46dc062293e2`

## Summary

Task 172 decoupled
`tools/emit-allowlisted-death-validation-batch-artifacts.mjs` into explicit
`parity` and `batch` runner modes.

Parity mode preserves the Task 171 exact-15 parity behavior. It requires
`--reference-status`, uses the fixed parity output root, emits compact
`death_validation` artifacts, and compares against the Task 168 reference
status.

Batch mode rejects `--reference-status` and uses a manifest-specific output root
under:

`output/local-replay-processing/allowlisted-death-validation-batches/<manifestId>/`

Task 172 validated batch mode by contract only. It did not process replays in
batch mode and did not emit real batch artifacts.

## Parity Reexecution

The exact-15 parity path was reexecuted for the existing allowlisted set only:

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

Results:

- processed replay count: 15
- emitted artifact count: 15
- schema validation: passed
- output policy: passed
- size audit: passed
- parity comparison: passed

## Outputs

- `output/local-replay-processing/allowlisted-death-validation-batch-runner/runner-mode-contract-gate.json`
- `output/local-replay-processing/allowlisted-death-validation-batch-runner/runner-mode-contract-summary.json`
- `output/local-replay-processing/allowlisted-death-validation-batch-runner/batch-mode-contract-manifest-template.json`
- `output/local-replay-processing/allowlisted-death-validation-batch-runner/parity-mode-contract-summary.json`
- `output/local-replay-processing/allowlisted-death-validation-batch-runner/protection-audit.json`
- `output/local-replay-processing/allowlisted-death-validation-batch-parity/allowlisted-batch-gate.json`
- `output/local-replay-processing/allowlisted-death-validation-batch-parity/allowlisted-batch-summary.json`
- `reports/allowlisted-death-validation-runner-mode-contract.md`

## Protections

`replay_005`, `replay_006`, `replay_007`, `replay_008`, and `replay_020` were
not accessed or processed. No new replay outside the exact-15 parity set was
processed. Batch mode processed no replays and emitted no real artifacts.

No artifact outside `death_validation`, death events, respawn events, timelines,
objective lifecycle, player identity rows, attribution, field values, raw data,
snapshots, source/canonical/match final facts, gameplay interpretation, parser
or engine behavior change, `packages/deadem/**` change, recovery, skip,
placeholder, default behavior change, parser opt-in, Java/Clarity/external
parser, WSL, iaflow, Product Reviewer automation, pull/merge/cherry-pick/rebase,
or Task 173 was produced.
