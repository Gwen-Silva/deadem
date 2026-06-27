# Experiment 24 lane occupancy validation infrastructure

## Summary

Task 002 prepared local infrastructure for stratified human validation of experiment 23 lane occupancy outputs.

Gate result:

```text
awaiting_human_labels
```

This is not scientific validation of experiment 24. It means only that review samples, templates, tooling, and scoring infrastructure are ready for human labeling.

## Files produced

- `experiments/24-build-stratified-lane-occupancy-validation.js`
- `experiments/24-score-lane-occupancy-validation.js`
- `tools/24-lane-occupancy-review.html`
- `docs/24-lane-occupancy-human-review.md`
- `output/24-point-review-samples.json`
- `output/24-episode-review-samples.json`
- `output/24-point-review-unlabeled-template.json`
- `output/24-episode-review-unlabeled-template.json`
- `output/24-human-review-gate.json`

## Sampling strategy

Point samples are selected deterministically from `output/23-calibrated-lane-occupancy.json` across player, state, physical lane, and match phase strata.

Episode samples are selected deterministically from `output/23-calibrated-occupancy-episodes.json` across player, episode type, physical lane, match phase, confidence/state, and duration strata.

Generated coverage:

- point samples: 120
- episode samples: 72
- point phases: early 38, middle 41, late 41
- episode phases: early 22, middle 25, late 25
- point lanes: lane_1 15, lane_2 39, lane_3 28, none 38
- episode lanes: lane_1 20, lane_2 30, lane_3 22

## JSON sizes

- `output/24-episode-review-samples.json`: 65.5 KiB
- `output/24-episode-review-unlabeled-template.json`: 81.5 KiB
- `output/24-human-review-gate.json`: 882 B
- `output/24-point-review-samples.json`: 85.4 KiB
- `output/24-point-review-unlabeled-template.json`: 112.2 KiB

All generated JSON outputs are below 10 MiB.

## Scoring behavior

`experiments/24-score-lane-occupancy-validation.js --template-check` validates that unlabeled templates contain no completed review fields and confirms the gate is `awaiting_human_labels`.

The scoring mode requires both labeled files:

- `output/24-point-review-labeled.json`
- `output/24-episode-review-labeled.json`

It refuses to compute validation metrics if labeled files are missing or fail the minimum coverage gate.

## Commands run

```bash
node experiments/24-build-stratified-lane-occupancy-validation.js
node experiments/24-score-lane-occupancy-validation.js --template-check
node node_modules\eslint\bin\eslint.js -c eslint.common.config.js experiments\24-build-stratified-lane-occupancy-validation.js experiments\24-score-lane-occupancy-validation.js
node -e "for (const f of ['output/24-point-review-samples.json','output/24-episode-review-samples.json','output/24-point-review-unlabeled-template.json','output/24-episode-review-unlabeled-template.json','output/24-human-review-gate.json']) JSON.parse(require('node:fs').readFileSync(f, 'utf8'));"
npm.cmd run check:outputs -- 24
npm.cmd run validate:tasks
```

An earlier `npm.cmd run lint -- experiments/...` attempt failed because the root lint script delegates to package workspaces, where root-level `experiments/...` paths do not exist. The task validation was updated to use the repository ESLint config directly for these root files.

## Validation results

- ESLint passed with `eslint.common.config.js`.
- Generated JSON files parsed successfully.
- Output size check passed for all `output/24-*.json` files.
- Task queue validation passed while task 002 was active.
- `git status --short -- output\23-*.json` reported no modified experiment 23 outputs.

## Human action required

Human reviewers must populate:

- `output/24-point-review-labeled.json`
- `output/24-episode-review-labeled.json`

Minimum gate:

- at least 60 non-ambiguous point samples
- at least 30 non-ambiguous episode samples
- all three lanes represented
- all 12 players represented
- early, middle, and late match phases represented

## Uncertainties

- The sample set is designed for review coverage, not statistical representativeness.
- Lane labels remain unvalidated until human review is completed.
- Transition readiness remains blocked until labels are scored by a later authorized task.
