# Task 005: Revise lane occupancy model

Status: pending
Execution mode: autonomous
Project stage: Lane occupancy validation
Related experiment: 24
Priority: high
Depends on: task 008
Unlocked by: task 008 gate equals autonomous_evidence_requires_model_revision with mechanical contradictions or instability traceable to measurements
Blocks: task 006

## Objective

Correct only lane occupancy errors demonstrated by autonomous independent evidence or later human validation.

Every change must trace:

```text
observed evidence-reviewed error
-> technical cause
-> proposed correction
-> expected effect
```

## Context to read

Read only task 008 autonomous audit outputs, related reports, and the specific occupancy code under review.

## Work requested

Implement a scoped model correction only when task 008 or later human validation demonstrates a concrete error.

## Constraints

- Do not change thresholds only to improve internal metrics.
- Do not introduce transition detection.
- Do not process a second replay.

## Inputs

- task 008 autonomous audit outputs

## Outputs

- revised occupancy model artifacts
- correction report

## Acceptance criteria

Each correction is traceable to a measured evidence-reviewed error and has a stated expected effect.

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

Stop if the requested change is not supported by autonomous independent evidence or later human-reviewed evidence.
