# Task 051: Investigate Replay 006 Entity Lifecycle Or State Refresh Gap

Status: blocked
Execution mode: autonomous
Project stage: parser compatibility
Related experiment: replay 006 state reconstruction divergence
Priority: medium
Depends on: task 050 completed
Unlocked by: explicit authorization to investigate the generic entity lifecycle/state-refresh gap before tick 3808
Blocks: replay 006 parser/protocol support

## Objective

Determine why replay 006 reaches a valid packet-entity UPDATE for entity 5594 before the parser has created or retained entity 5594.

## Constraints

- Do not process replay 005.
- Do not add entity-, baseline-, or class-specific skips.
- Do not fabricate entities, baselines, classes, or serializers.
- Do not extract semantic telemetry after unstable state.

## Inputs

- `reports/replay-006-state-reconstruction-divergence.md`
- `output/parser-compatibility/replay-006-earliest-divergence.json`
- `output/parser-compatibility/replay-006-divergence-window.jsonl`

## Acceptance criteria

A generic lifecycle, state-refresh, schema-version, or ordering defect is demonstrated before any production fix is attempted.

## Gate result

Blocked until explicitly authorized.

## Prior gate

replay_006_divergence_narrowed_not_confirmed
