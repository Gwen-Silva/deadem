# Task 002: Build stratified lane occupancy validation

Status: completed
Execution mode: autonomous
Project stage: Lane occupancy validation
Related experiment: 24
Priority: high
Depends on: experiment 23 decision packet
Unlocked by: `reports/23-lane-occupancy-decision-packet.md` exists and recommends stratified manual validation
Blocks: task 003
Expected gate result: awaiting_human_labels

## Objective

Prepare the validation infrastructure for experiment 24 without performing human review or claiming scientific validation.

The objective is limited to:

- generating stratified point-review samples
- generating stratified episode-review samples
- creating local human-review tooling
- creating empty labeling templates
- creating the scoring script without fabricating scores
- documenting the human labeling process

Completion means only that the validation infrastructure is ready for human labeling.

## Context to read

Read only:

- `AGENTS.md`
- `docs/PROJECT_STATE.md`
- `reports/23-lane-occupancy-decision-packet.md`
- `output/23-calibrated-lane-occupancy.json`
- `output/23-calibrated-occupancy-episodes.json`
- `output/23-occupancy-calibration-review.json`
- `output/23-occupancy-model-comparison.json`

Do not inspect unrelated experiment outputs.

## Work requested

Create an isolated experiment 24 validation setup that:

- builds deterministic stratified point-review samples from experiment 23 occupancy output
- builds deterministic stratified episode-review samples from experiment 23 episode output
- writes empty unlabeled templates for human reviewers
- provides a local review interface or tool for inspecting and filling labels
- creates `experiments/24-score-lane-occupancy-validation.js`
- refuses to compute validation metrics until labeled files exist and pass coverage checks
- records the project gate as `awaiting_human_labels`

## Constraints

- Do not alter the parser or package source.
- Do not reprocess `samples/partida_001.dem`.
- Do not fabricate labels.
- Do not perform human review.
- Do not calculate accuracy from empty templates.
- Do not revise the occupancy model.
- Do not detect transitions.
- Do not process a second replay.
- Keep generated JSON outputs below 10 MiB.

## Inputs

- `output/23-calibrated-lane-occupancy.json`
- `output/23-calibrated-occupancy-episodes.json`
- `output/23-occupancy-calibration-review.json`
- `output/23-occupancy-model-comparison.json`

## Outputs

- `output/24-point-review-samples.json`
- `output/24-episode-review-samples.json`
- `output/24-point-review-unlabeled-template.json`
- `output/24-episode-review-unlabeled-template.json`
- `output/24-human-review-gate.json`
- `experiments/24-build-stratified-lane-occupancy-validation.js`
- `experiments/24-score-lane-occupancy-validation.js`
- `tools/24-lane-occupancy-review.html`
- `docs/24-lane-occupancy-human-review.md`
- `reports/24-lane-occupancy-validation-infrastructure.md`

## Acceptance criteria

The task is complete when:

- point-review sample output exists
- episode-review sample output exists
- unlabeled point and episode templates exist
- the local review interface or tool exists
- `experiments/24-score-lane-occupancy-validation.js` exists
- human review documentation exists
- generated sample/template JSON files parse successfully
- the scoring script does not fabricate labels or compute accuracy without labeled files
- the task report records `awaiting_human_labels`
- completion does not imply that experiment 24 has been scientifically validated

## Required validation

Run:

```bash
node node_modules\eslint\bin\eslint.js -c eslint.common.config.js experiments\24-build-stratified-lane-occupancy-validation.js experiments\24-score-lane-occupancy-validation.js
node experiments/24-build-stratified-lane-occupancy-validation.js
node experiments/24-score-lane-occupancy-validation.js --template-check
node -e "for (const f of ['output/24-point-review-samples.json','output/24-episode-review-samples.json','output/24-point-review-unlabeled-template.json','output/24-episode-review-unlabeled-template.json','output/24-human-review-gate.json']) JSON.parse(require('node:fs').readFileSync(f, 'utf8'));"
npm.cmd run check:outputs -- 24
npm.cmd run validate:tasks
```

Confirm with Git that no existing `output/23-*` file changed.

## Gate result

Allowed machine-readable result:

- `awaiting_human_labels`

## Documentation updates

Create or update:

- `docs/24-lane-occupancy-human-review.md`
- `reports/24-lane-occupancy-validation-infrastructure.md`
- `reports/latest.md`

Do not update the latest completed experiment number in `docs/PROJECT_STATE.md` unless the task report explicitly justifies it.

## Git scope

The task may commit only:

- this task file
- `experiments/24-build-stratified-lane-occupancy-validation.js`
- `experiments/24-score-lane-occupancy-validation.js`
- `tools/24-lane-occupancy-review.html`
- `docs/24-lane-occupancy-human-review.md`
- `reports/24-lane-occupancy-validation-infrastructure.md`
- `reports/latest.md`
- `output/24-point-review-samples.json`
- `output/24-episode-review-samples.json`
- `output/24-point-review-unlabeled-template.json`
- `output/24-episode-review-unlabeled-template.json`
- `output/24-human-review-gate.json`

Do not commit replay files, external data, unrelated outputs, or parser/library changes.

## Expected report

The report must include:

- files produced
- sampling strategy
- validation commands
- generated JSON sizes
- scoring-script behavior before labels exist
- gate result
- remaining human action
- uncertainties

## Stop conditions

Stop with `NO_EXECUTABLE_PENDING_TASK` after the task is completed and no pending tasks remain.

Block instead of guessing when:

- required experiment 23 outputs are missing
- output schemas are incompatible with deterministic sample generation
- generated JSON exceeds 10 MiB
- completing the work would require human labels
- completing the work would require changing the occupancy model
