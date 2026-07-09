# Allowlisted Death Validation Batch Mode Smoke

Gate: `allowlisted_death_validation_batch_mode_smoke_ready`

Batch runner gate: `allowlisted_death_validation_batch_emitted`

Task 173 ran the first real `runnerMode: batch` smoke for the already
authorized exact-15 compact `death_validation` set. The command used the batch
manifest and did not pass `--reference-status`.

## Command Shape

`npm run emit:allowlisted-death-validation-batch -- --manifest output/local-replay-processing/allowlisted-death-validation-batch-runner/exact-15-batch-mode-smoke-manifest.json --summary-output output/local-replay-processing/allowlisted-death-validation-batches/exact_15_batch_mode_smoke/`

## Results

- runner mode: batch
- reference status: not passed
- parity comparison required: false
- parity status: not_required
- processed replay count: 15
- emitted artifact count: 15
- schema validation: passed
- output policy: passed
- size audit: passed

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

## Boundaries

Only the exact-15 smoke manifest was processed. `replay_005`, `replay_006`,
`replay_007`, `replay_008`, and `replay_020` were not accessed or processed.
No `death_validation` artifact was emitted for `replay_020`.

## Interpretation Limits

`eventCount` remains a compact source-observed counter transition candidate
count, not a final death fact. `sourceObservedCounterTransitionCandidateTotal`
is not a total death count. This smoke does not conclude Source 2 semantics,
total parser correctness, replay corruption status, or gameplay truth.

No artifact outside `death_validation`, death events, respawn events, timelines,
objective lifecycle, player identity rows, killer/victim/assist attribution,
field values, raw replay bytes, raw payloads, raw entityData, raw
serializedEntities, string values, snapshots, full entity histories, final
source/canonical/match facts, gameplay interpretation, parser/engine behavior
change, `packages/deadem/**` change, recovery, skip, placeholder, default
behavior change, parser opt-in, Java/Clarity/external parser, WSL, iaflow,
Product Reviewer automation, pull/merge/cherry-pick/rebase, or Task 174 was
produced.
