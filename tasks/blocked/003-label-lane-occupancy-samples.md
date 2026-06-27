# Task 003: Label lane occupancy samples

Status: blocked
Execution mode: human
Project stage: Lane occupancy validation
Related experiment: 24
Priority: high
Depends on: task 002 completed with gate awaiting_human_labels
Unlocked by: required labeled files exist and meet minimum coverage
Blocks: task 004

## Objective

Human reviewers must populate:

- `output/24-point-review-labeled.json`
- `output/24-episode-review-labeled.json`

Required labels:

- correct
- incorrect
- ambiguous
- reviewed physical lane
- reviewer confidence
- observed evidence

Minimum completion gate:

- at least 60 non-ambiguous point samples
- at least 30 non-ambiguous episode samples
- all three lanes represented
- all 12 players represented
- early, middle, and late match phases represented

This task must not be executed, completed, or simulated by Codex.

## Context to read

Human reviewers should use the review documentation and local review tool produced by task 002.

## Work requested

Perform manual review outside the autonomous queue.

## Constraints

- Do not move this task to `tasks/pending/`.
- Do not allow Codex to fabricate, infer, or complete labels.

## Inputs

- `output/24-point-review-unlabeled-template.json`
- `output/24-episode-review-unlabeled-template.json`

## Outputs

- `output/24-point-review-labeled.json`
- `output/24-episode-review-labeled.json`

## Acceptance criteria

The labeled files exist and meet the minimum completion gate.

## Required validation

Manual gate evidence must be verified by a separate autonomous task after labels exist.

## Gate result

Allowed machine-readable result:

- `human_labels_complete`
- `human_labels_incomplete`

## Documentation updates

None by the autonomous runner.

## Git scope

None for Codex execution.

## Expected report

Human reviewers may summarize completed coverage separately.

## Stop conditions

Stop while labels are missing or coverage is insufficient.
