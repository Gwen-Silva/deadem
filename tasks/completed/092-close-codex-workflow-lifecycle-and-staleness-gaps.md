# Task 092: Close Codex Workflow Lifecycle And Staleness Gaps

Status: completed

Execution mode: autonomous after explicit authorization

## Objective

Close the final Codex workflow lifecycle, stale-validation, structured-check, and integration-test gaps before any replay-related work resumes.

## Changes

- Renumbered replay-002 terminal validation to blocked Task 093.
- Renumbered next-control selection to blocked Task 094.
- Marked Task 091's spec as completed.
- Restricted real workflow execution to `authorized` and `active` tasks, with only explicit final validation allowed for a completing task.
- Added validation fingerprints covering commits, spec hash, workflow hash, Git status, changed files, hashes, removals, renames, staged files, unstaged files, and untracked files.
- Made review recompute the fingerprint and fail closed on staleness.
- Replaced command strings with structured check records and safe argument arrays.
- Added integrated validation and review tests.

## Validation

Focused workflow tests, task queue validation, lint, output-size checks, final Task 092 validation, and final Task 092 review passed. The known oversized historical output remains preexisting and locally reported.

## Gate

`codex_task_workflow_optimization_ready_v3`

## Follow-up

Task 093 remains blocked for replay-002 terminal validation. Task 094 remains blocked for next-control selection. Neither was executed.
