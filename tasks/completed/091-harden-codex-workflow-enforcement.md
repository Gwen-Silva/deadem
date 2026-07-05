# Task 091: Harden Codex Workflow Enforcement

Status: completed

Execution mode: autonomous after explicit authorization

## Objective

Harden the Codex workflow before any new replay-related task runs. This task only changed workflow tooling, policies, task specs, tests, and compact documentation.

## Changes

- Renumbered the replay-002 terminal validation correction to blocked Task 092.
- Renumbered next-control selection to blocked Task 093.
- Made dry-run `prepare` and `preflight` in-memory only.
- Centralized path containment with symlink-aware realpath checks.
- Made review depend on a current passing validation result.
- Replaced hard-coded gate discovery with task-specific gate sources.
- Added controlled required-check execution with local log hashes.
- Preserved compact context and review packet limits.

## Validation

- Focused workflow tests passed.
- Task 092 dry-run preflight passed.
- Task 092 dry-run prepare returned only in-memory packet metadata.
- No replay was processed.
- No replay output or canonical factual artifact was modified.

## Gate

`codex_task_workflow_optimization_ready_v2`

## Follow-up

Task 092 remains blocked. Task 093 remains blocked. Neither was executed.

## Review Note

The v2 workflow gate was not accepted after review. Task lifecycle handling and stale-validation detection were transferred to Task 092. Do not treat v2 as the accepted final workflow gate.
