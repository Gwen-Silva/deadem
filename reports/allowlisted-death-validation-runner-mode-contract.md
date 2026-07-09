# Allowlisted Death Validation Runner Mode Contract

Gate: `allowlisted_death_validation_runner_mode_contract_ready`

Task 172 split the allowlisted compact `death_validation` runner into explicit
runner modes while preserving the exact-15 parity path.

## Mode Contract

- `parity`: requires `--reference-status`, writes only to
  `output/local-replay-processing/allowlisted-death-validation-batch-parity/`,
  and compares against the Task 168 exact-15 reference status.
- `batch`: rejects `--reference-status`, requires a manifest-specific output
  root under
  `output/local-replay-processing/allowlisted-death-validation-batches/<manifestId>/`,
  and is intended for future explicitly authorized allowlisted batches.

## Task 172 Execution

The exact-15 parity mode was reexecuted and passed:

- processed replay count: 15
- emitted artifact count: 15
- schema validation: passed
- output policy: passed
- size audit: passed
- parity comparison: passed

Batch mode was validated by contract only. It did not process replays and did
not emit real batch artifacts.

## Boundaries

Only the exact-15 parity set was processed:

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

## Limits

`eventCount` remains a source-observed counter transition candidate count, not a
final death fact. No artifacts outside `death_validation`, death events,
respawn events, timelines, objective lifecycle rows, identity rows, attribution,
field values, raw data, snapshots, final source/canonical/match facts, or
gameplay interpretation were emitted.
