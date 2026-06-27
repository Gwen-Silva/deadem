# Task 006: Validate occupancy holdout

Status: blocked
Execution mode: mixed
Project stage: Lane occupancy validation
Related experiment: 24
Priority: high
Depends on: task 005
Unlocked by: revised model exists and holdout sampling protocol is defined
Blocks: task 007 or task 009

## Objective

Validate the revised model using samples not directly used for correction.

The validation must preserve distributions by:

- lane
- player
- match phase
- state
- episode duration

It must compare the original and revised models.

## Context to read

Read task 005 correction evidence and the holdout protocol.

## Work requested

Run holdout validation after the revised model and holdout sampling protocol exist.

## Constraints

- Do not move this task to `tasks/pending/`.
- Do not define final numeric acceptance thresholds unless already documented by a prior decision.
- Record missing thresholds as a methodological gate instead of inventing values.

## Inputs

- revised model outputs
- holdout sampling protocol

## Outputs

- holdout comparison outputs
- holdout validation report

## Acceptance criteria

Original and revised models are compared on holdout samples that preserve the required distributions.

## Required validation

Run ESLint and parse all generated JSON outputs.

## Gate result

Allowed machine-readable results:

- `approved_on_holdout`
- `failed_on_holdout`
- `insufficient_holdout_labels`

## Documentation updates

Document holdout design, results, and missing thresholds.

## Git scope

Only holdout validation artifacts.

## Expected report

Summarize holdout coverage, original-versus-revised comparison, and gate result.

## Stop conditions

Stop if the revised model or holdout protocol is unavailable.
