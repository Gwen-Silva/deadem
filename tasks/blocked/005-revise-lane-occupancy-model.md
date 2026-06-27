# Task 005: Revise lane occupancy model

Status: blocked
Execution mode: autonomous
Project stage: Lane occupancy validation
Related experiment: 24
Priority: high
Depends on: task 004
Unlocked by: task 004 gate equals requires_model_revision
Blocks: task 006

## Objective

Correct only lane occupancy errors demonstrated by human validation.

Every change must trace:

```text
observed human-reviewed error
-> technical cause
-> proposed correction
-> expected effect
```

## Context to read

Read only task 004 validation outputs, related reports, and the specific occupancy code under review.

## Work requested

Implement a scoped model correction only when task 004 demonstrates a concrete error.

## Constraints

- Do not move this task to `tasks/pending/`.
- Do not change thresholds only to improve internal metrics.
- Do not introduce transition detection.
- Do not process a second replay.

## Inputs

- task 004 validation outputs

## Outputs

- revised occupancy model artifacts
- correction report

## Acceptance criteria

Each correction is traceable to a human-reviewed error and has a stated expected effect.

## Required validation

Run ESLint, parse generated JSON, and compare revised outputs to the demonstrated error cases.

## Gate result

Allowed machine-readable results:

- `revision_ready_for_holdout`
- `revision_blocked`

## Documentation updates

Document every correction trace.

## Git scope

Only files required for demonstrated corrections.

## Expected report

Summarize observed error, cause, correction, expected effect, and validation.

## Stop conditions

Stop if the requested change is not supported by human-reviewed evidence.
