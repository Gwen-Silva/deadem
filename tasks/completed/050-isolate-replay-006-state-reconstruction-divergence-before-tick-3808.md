# Task 050: Isolate Replay 006 State Reconstruction Divergence Before Tick 3808

Status: completed
Execution mode: autonomous
Project stage: parser compatibility
Related experiment: structural replay stream pass
Priority: medium
Depends on: task 047 completed with structural traversal reaching EOF
Unlocked by: explicit authorization to compare state reconstruction against the structural envelope stream
Blocks: replay 006 parser/protocol support

## Objective

Compare gameplay-state reconstruction against the structurally readable replay-envelope stream and locate the earliest divergence before the visible tick 3808 exception.

## Context to read

- `reports/structural-replay-stream-pass.md`
- `output/parser-compatibility/replay-006-structural-boundary-audit.json`
- `output/parser-compatibility/structural-pass-cross-replay-matrix.json`
- parser state-reconstruction code directly involved in entity, baseline, class, and serializer handling

## Work requested

Identify where state reconstruction diverges from valid structural envelopes without adding another entity-, baseline-, or class-specific skip.

## Constraints

- Do not process replay 005.
- Do not fabricate entities, baselines, classes, or serializers.
- Do not create a missing-ID-specific recovery.
- Do not extract semantic telemetry from unstable continuation.

## Inputs

- Structural pass outputs from task 047.
- Existing parser failure diagnostics for entity 5594, baseline 709, and class 891.

## Outputs

- Divergence report and compact structured diagnostics.

## Acceptance criteria

- Earliest state-reconstruction divergence is localized relative to command/message envelope records.
- The analysis preserves the distinction between structural readability and gameplay-state reconstruction.

## Required validation

- Engine tests.
- JSON validation.
- Replay 005 protection check.
- Task queue validation.

## Gate result

replay_006_divergence_narrowed_not_confirmed

## Documentation updates

Update parser failure catalog and project state if executed.

## Git scope

Stage only parser diagnostics, reports, docs, and task files.

## Expected report

Explain why replay 006 state reconstruction diverges despite structural readability.

## Stop conditions

Stop if the next step would require semantic telemetry extraction from unstable parser state.

## Prior interpretation

replay_006_state_reconstruction_failure
