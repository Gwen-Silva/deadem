# Task 049: Apply Approved Repository Cleanup Plan

Status: completed
Execution mode: autonomous
Project stage: repository hygiene
Related experiment: repository maintenance
Priority: medium
Depends on: task 048 completed
Unlocked by: explicit user authorization for conservative navigation-first cleanup with approved allowlists
Blocks: repository cleanup execution

## Objective

Apply only an explicitly approved repository cleanup allowlist derived from `output/repository-audit/cleanup-proposal.json`.

## Context to read

- `AGENTS.md`
- `docs/PROJECT_STATE.md`
- `reports/repository-hygiene-and-cleanup-audit.md`
- `output/repository-audit/cleanup-proposal.json`

## Work requested

Delete, move, archive, or consolidate only files explicitly allowlisted by the user.

## Constraints

- No broad glob deletion.
- No replay, MP4, frame, contact sheet, cache, or virtual-environment commits.
- No cleanup operation without an explicit source and destination or delete allowlist.
- Validate every reference update.

## Inputs

- User-approved allowlist of files to delete.
- User-approved allowlist of files to move.
- User-approved allowlist of files to archive.
- User-approved allowlist of files to consolidate.

## Outputs

- Cleanup commit with reference updates and validation report.

## Acceptance criteria

- Only allowlisted files are changed.
- Reference updates pass validation.
- Git diff contains no unapproved paths.

## Required validation

- JSON/CSV validation.
- Documentation-link validation.
- Task queue validation.
- Git status validation.

## Gate result

repository_cleanup_applied_with_deferred_items

## Documentation updates

Update indexes and repository guide if approved paths move.

## Git scope

Stage only approved cleanup paths and required reference updates.

## Expected report

Summarize approved cleanup operations and validation.

## Stop conditions

Stop if the requested cleanup is broader than the explicit allowlist.
