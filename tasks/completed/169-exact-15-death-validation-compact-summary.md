# Task 169 - Build Exact 15 Death Validation Compact Summary

Status: completed

Gate: `exact_15_death_validation_compact_summary_ready`

Commit message: `Summarize exact 15 death validation compact artifacts`

Task 169 added `tools/summarize-exact-15-death-validation-compact-artifacts.mjs`
and the npm script `summarize:exact-15-death-validation-compact`. The script
reads only the compact JSON artifacts and summaries emitted by Task 168 under
`output/local-replay-processing/exact-15-death-validation-compact-emission/`.
It does not access replay files, run the parser, run any emission runner, or
emit new `death_validation.json` artifacts.

Outputs produced:

- `output/local-replay-processing/exact-15-death-validation-compact-summary/summary-gate.json`
- `output/local-replay-processing/exact-15-death-validation-compact-summary/replay-event-count-index.json`
- `output/local-replay-processing/exact-15-death-validation-compact-summary/aggregate-counter-transition-summary.json`
- `output/local-replay-processing/exact-15-death-validation-compact-summary/schema-policy-size-rollup.json`
- `output/local-replay-processing/exact-15-death-validation-compact-summary/interpretation-boundaries.json`
- `output/local-replay-processing/exact-15-death-validation-compact-summary/protection-audit.json`
- `reports/exact-15-death-validation-compact-summary.md`

Aggregate summary:

- artifactCount: 15
- sourceObservedCounterTransitionCandidateTotal: 1199
- minEventCount: 45
- maxEventCount: 117
- duplicateKeyTotal: 0
- allValidationStatuses: `source_events_available_with_limitations`

The replay-event-count index has one item for each Task 168 artifact:
replay_001, replay_002, replay_003, replay_004, replay_009, replay_010,
replay_011, replay_012, replay_013, replay_014, replay_015, replay_016,
replay_017, replay_018, and replay_019.

Interpretation boundaries:

`eventCount` and `sourceObservedCounterTransitionCandidateTotal` remain
source-observed counter transition candidate counts. They are not final death
facts, canonical truth, player identity, killer/victim/assist attribution,
objective attribution, timeline output, Source 2 semantic validation, total
parser correctness proof, or gameplay interpretation.

No replay was accessed, opened, hashed, copied, inspected, parsed, or
processed. No parser or emission runner was executed. No new `death_validation`
artifact, death event, respawn event, timeline, objective lifecycle, identity
row, attribution, field value, raw replay bytes, raw payload, raw entityData,
raw serializedEntities, string value, snapshot, full entity history,
source/canonical/match final fact, gameplay interpretation, parser/engine
behavior change, `packages/deadem/**` change, recovery, skip mode, placeholder,
default behavior change, parser opt-in, Java/Clarity/external parser, WSL,
iaflow, Product Reviewer automation, pull/merge/cherry-pick/rebase, or Task
170 was produced.

Recommended next action:
decide how the compact summary should be presented or consumed while preserving
the same non-factual and non-interpretive boundaries.
