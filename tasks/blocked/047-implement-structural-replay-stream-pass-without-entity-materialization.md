# Task 047: Implement Structural Replay Stream Pass Without Entity Materialization

Status: blocked
Execution mode: autonomous
Project stage: parser compatibility
Related experiment: parser compatibility matrix
Priority: medium
Depends on: task 046 completed
Unlocked by: explicit authorization to implement a structural replay pass after reviewing parser compatibility matrix outputs
Blocks: parser compatibility metadata-only mode

## Objective

Implement a structural replay stream pass that reads replay headers, command/tick envelopes, packet boundaries, message type IDs, payload sizes, source offsets, monotonicity, and malformed boundaries without materializing entities, baselines, class state, positions, or gameplay events.

## Context to read

- `AGENTS.md`
- `docs/PROJECT_STATE.md`
- `docs/PARSER_FAILURE_CATALOG.md`
- `reports/parser-compatibility-matrix.md`
- `output/parser-compatibility/structural-pass-feasibility.json`

## Work requested

Create a bounded structural parser pass suitable for metadata-only compatibility assessment.

## Constraints

- Do not materialize entities.
- Do not materialize baselines.
- Do not build class state.
- Do not extract positions or gameplay events.
- Do not process replay 005 unless a future task explicitly authorizes final-holdout-safe metadata inspection.

## Inputs

- Existing parser stream code.
- Parser compatibility matrix outputs.

## Outputs

- Structural pass code and tests.
- Bounded structural-pass sample outputs.

## Acceptance criteria

- The pass can report packet/message envelopes without triggering entity, class, or baseline reconstruction.
- Malformed boundaries are reported structurally, not recovered semantically.

## Required validation

- Parser tests.
- New structural-pass tests.
- JSON validation.
- Replay 005 protection check.
- Task queue validation.

## Gate result

Blocked until explicitly authorized.

## Documentation updates

Update parser compatibility docs after implementation.

## Git scope

Stage only structural-pass code, tests, docs, and small structured outputs.

## Expected report

Explain whether metadata-only compatibility mode is now available.

## Stop conditions

Stop if implementation would require gameplay entity materialization.
