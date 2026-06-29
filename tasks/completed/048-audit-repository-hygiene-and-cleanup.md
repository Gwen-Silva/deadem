# Task 048: Audit Repository Hygiene and Cleanup

Status: completed
Execution mode: autonomous
Project stage: repository hygiene
Related experiment: repository maintenance
Priority: medium
Depends on: current repository state after task 046
Unlocked by: explicit user request for repository file-usage and cleanup audit
Blocks: approved repository cleanup execution

## Objective

Create a complete repository file-usage and cleanup audit that identifies canonical files, active dependencies, unique evidence, historical records, regenerable outputs, superseded files, duplicates, temporary files, local-only conventions, and unknown files requiring investigation.

## Context to read

- `AGENTS.md`
- `docs/PROJECT_STATE.md`
- task request text
- tracked repository file list

## Work requested

- Audit tracked files without deleting, moving, renaming, or consolidating existing files.
- Create machine-readable inventory, reference graph, canonical map, version-chain audit, duplicate analysis, task index, cleanup proposal, metrics, and gate.
- Create navigation files: `docs/REPOSITORY_GUIDE.md`, `reports/INDEX.md`, `tasks/completed/INDEX.md`, and `output/README.md`.
- Create a blocked cleanup-application task requiring explicit user approval and allowlists.

## Constraints

- Do not process any replay.
- Do not process replay 005.
- Do not delete, rename, move, or consolidate existing tracked files.
- Do not commit replay files, videos, frames, contact sheets, local debug logs, virtual environments, or caches.

## Inputs

- Tracked repository files.
- Detectable ignored/untracked directory conventions.
- Existing docs, reports, tasks, scripts, outputs, and manifests.

## Outputs

- `output/repository-audit/file-inventory.json`
- `output/repository-audit/file-inventory.csv`
- `output/repository-audit/reference-graph.json`
- `output/repository-audit/canonical-file-map.json`
- `output/repository-audit/version-chain-audit.json`
- `output/repository-audit/duplicate-analysis.json`
- `output/repository-audit/task-index.json`
- `output/repository-audit/cleanup-proposal.json`
- `output/repository-audit/audit-metrics.json`
- `output/repository-audit/repository-hygiene-gate.json`
- `docs/REPOSITORY_GUIDE.md`
- `reports/INDEX.md`
- `tasks/completed/INDEX.md`
- `output/README.md`
- `reports/repository-hygiene-and-cleanup-audit.md`

## Acceptance criteria

- Every tracked file has one inventory record.
- Reports, tasks, outputs, and match 91119257 chains are classified.
- Cleanup proposal is phased and not executed.
- Navigation files are created without moving existing files.
- Unknowns are preserved with conservative recommendations.

## Required validation

- Run engine tests.
- Run video-pipeline tests.
- Run ESLint for changed JavaScript.
- Validate JSON and CSV outputs.
- Validate documentation links where available.
- Run task queue validation.
- Verify replay 005 protection.
- Verify no existing tracked file was deleted, moved, or renamed.

## Gate result

repository_cleanup_audit_ready_with_unknowns

## Documentation updates

Create repository guide, report index, completed task index, output README, and hygiene report.

## Git scope

Stage only audit code, audit outputs, navigation docs, report, and task files.

## Expected report

Summarize metrics, canonical files, unknowns, cleanup phases, and safe next steps.

## Stop conditions

Stop after committing the audit and blocked cleanup task. Do not execute cleanup.
