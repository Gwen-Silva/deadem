# Task 003: Label lane occupancy samples

Status: blocked
Execution mode: human
Project stage: Lane occupancy validation
Related experiment: 24
Priority: high
Depends on: autonomous independent lane occupancy audit
Unlocked by: autonomous evidence audit identifies unresolved samples whose semantic correctness materially affects the project decision
Blocks: task 004

## Objective

Human reviewers must answer only minimized unresolved semantic questions selected by the autonomous evidence audit.

When unlocked, reviewers may populate:

- `output/24-point-review-labeled.json`
- `output/24-episode-review-labeled.json`

Required labels:

- correct
- incorrect
- ambiguous
- reviewed physical lane
- reviewer confidence
- observed evidence

The eventual sample set must be limited to unresolved or disputed cases where semantic correctness materially affects the project decision.

This task must not be executed, completed, or simulated by Codex.

## Context to read

Human reviewers should use the minimized review queue produced by the autonomous evidence audit and answer only the explicit question attached to each sample.

## Work requested

Perform minimized manual review outside the autonomous queue only after autonomous evidence is exhausted.

## Constraints

- Do not move this task to `tasks/pending/`.
- Do not allow Codex to fabricate, infer, or complete labels.
- Do not review every generated sample by default.
- Do not expand beyond unresolved or disputed cases selected by autonomous audit.

## Inputs

- `output/24-minimal-human-review-queue.json`

## Outputs

- `output/24-point-review-labeled.json`
- `output/24-episode-review-labeled.json`

## Acceptance criteria

The minimized labeled files exist and answer every explicit human question required by the autonomous evidence audit.

## Required validation

Manual gate evidence must be verified by a separate autonomous task after minimized labels exist.

## Gate result

Allowed machine-readable result:

- `human_labels_complete`
- `human_labels_incomplete`

## Documentation updates

None by the autonomous runner.

## Git scope

None for Codex execution.

## Expected report

Human reviewers may summarize minimized answers separately.

## Stop conditions

Stop while minimized unresolved questions are missing, unanswered, or outside the autonomous audit queue.
