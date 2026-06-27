# Task 009: Detect validated lane transitions

Status: blocked
Execution mode: autonomous
Project stage: Spatial transitions
Related experiment: TBD
Priority: medium
Depends on: occupancy model approved
Unlocked by: validation gate equals validated_for_transition_candidates
Blocks: task 010

## Objective

Detect lane transition candidates using only a validated occupancy model.

The unit of detection must be:

```text
stable origin occupancy
-> transit interval
-> stable destination occupancy
```

## Context to read

Read the validation gate that approves transition candidate detection.

## Work requested

Build transition candidate detection after the approval gate exists.

## Constraints

- Do not move this task to `tasks/pending/`.
- Do not evaluate whether a rotation was good or bad.
- Do not infer intent.
- Do not infer strategic quality.
- Do not judge the outcome.

## Inputs

- validated lane occupancy outputs

## Outputs

- lane transition candidate outputs
- transition candidate report

## Acceptance criteria

Transition candidates are generated only from stable origin, transit, and stable destination intervals.

## Required validation

Run ESLint and parse all generated JSON outputs.

## Gate result

Allowed machine-readable results:

- `transition_candidates_ready_for_review`
- `transition_detection_blocked`

## Documentation updates

Document candidate definition and non-goals.

## Git scope

Only transition candidate artifacts.

## Expected report

Summarize candidate counts, definition, validation, and limitations.

## Stop conditions

Stop if the occupancy model is not approved for transition candidates.
