# Task 004: Score human lane validation

Status: blocked
Execution mode: autonomous
Project stage: Lane occupancy validation
Related experiment: 24
Priority: high
Depends on: task 003 human gate completed
Unlocked by: labeled point and episode files pass coverage validation
Blocks: task 005 or task 009

## Objective

Run:

```bash
node experiments/24-score-lane-occupancy-validation.js
```

Expected outputs:

- `output/24-point-validation-results.json`
- `output/24-episode-validation-results.json`
- `output/24-lane-confusion-matrix.json`
- `output/24-error-analysis.json`
- `output/24-transition-readiness-review.json`

Required metrics:

- stratified precision by state
- confusion matrix by physical lane
- base and deployment errors
- episode continuity
- fragmentation
- truncation
- transition readiness

## Context to read

Read only task 002 artifacts, task 003 labeled files, and the scoring script.

## Work requested

Score human-reviewed labels and produce the validation decision outputs.

## Constraints

- Do not move this task to `tasks/pending/`.
- Do not run without labeled files passing coverage validation.
- Do not revise the occupancy model.
- Do not detect transitions.

## Inputs

- `output/24-point-review-labeled.json`
- `output/24-episode-review-labeled.json`
- `experiments/24-score-lane-occupancy-validation.js`

## Outputs

- `output/24-point-validation-results.json`
- `output/24-episode-validation-results.json`
- `output/24-lane-confusion-matrix.json`
- `output/24-error-analysis.json`
- `output/24-transition-readiness-review.json`

## Acceptance criteria

All expected outputs exist, parse, and contain the required metrics.

## Required validation

Run ESLint for changed JavaScript and parse all generated JSON outputs.

## Gate result

Allowed machine-readable results:

- `validated_for_transition_candidates`
- `requires_model_revision`
- `insufficient_human_labels`

## Documentation updates

Write a concise scoring report.

## Git scope

Only task 004 artifacts and report files.

## Expected report

Summarize metrics, gate result, and uncertainty.

## Stop conditions

Stop if labeled files are missing or fail coverage validation.
