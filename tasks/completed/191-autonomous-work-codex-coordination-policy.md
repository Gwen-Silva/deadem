# Task 191 - Implement Autonomous ChatGPT Work And Codex Coordination Policy

Status: completed
Execution mode: codex

Gate: `autonomous_work_codex_coordination_policy_ready` (technical claim only)

## Objective

Version the normative Work–Codex–Chat separation, persistent coordination
state, future task contract, ordered context packet and fail-closed validators.

## Result

The technical implementation is complete and the project state remains
`VALIDATING`. Task 190 and commit
`13a3da64bcf0ba839a752038f07f40e3eeeed890` remain the last independently
accepted task and commit. Task 191 does not accept its own commit.

`BLOCKED_BY_SURFACE` preserves an instruction and state when no real launch
integration exists; no cross-surface integration is simulated by this task.

## Acceptance criteria

Technical criteria and mandatory checks are recorded in `tasks/specs/191.json`
and the Task 191 report. Final acceptance remains pending independent ChatGPT
Work validation.

## Required validation

Use the Task 191 context packet, validation result, review packet, gate and
summary. Work must independently decide the final gate.

## Stop conditions

Codex stops after this handoff and does not create or select Task 192.
