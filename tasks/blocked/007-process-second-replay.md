# Task 007: Process second replay

Status: blocked
Execution mode: mixed
Project stage: Generalization
Related experiment: TBD
Priority: medium
Depends on: occupancy model approved on first replay
Unlocked by: first-replay validation gate explicitly approves generalization testing and a compatible second replay is available
Blocks: geometry generalization decisions and transition generalization

## Objective

Process a compatible second replay only after the first-replay occupancy model is approved for generalization testing.

## Context to read

Read the first-replay validation gate and second-replay availability evidence.

## Work requested

Define and run the minimal second-replay processing needed for generalization testing.

## Constraints

- Do not move this task to `tasks/pending/`.
- Do not assume a second replay currently exists.
- Do not process any replay until explicitly authorized.

## Inputs

- approved first-replay validation gate
- compatible second replay

## Outputs

- second-replay derived artifacts
- generalization report

## Acceptance criteria

Generalization artifacts exist and are validated against the approved protocol.

## Required validation

Run task-specific validation only after replay availability is confirmed.

## Gate result

Allowed machine-readable results:

- `second_replay_processed`
- `second_replay_unavailable`

## Documentation updates

Document replay compatibility and generalization limits.

## Git scope

Only explicitly authorized second-replay artifacts.

## Expected report

Summarize replay compatibility, generated artifacts, and limitations.

## Stop conditions

Stop if no compatible second replay is available.
