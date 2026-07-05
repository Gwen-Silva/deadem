# Project Consolidation And Five-Replay Pilot Readiness

Gate: `project_consolidation_ready_for_five_replay_pilot`

## Summary

Task 093 consolidates the repository state before replay development resumes.
It accepts Codex workflow v3 as operationally sufficient, records replay 002 v8
as rejected historical evidence, defines the five-human-replay pilot, and
creates the finite Task 094-096 execution horizon.

## Contradictions Corrected

- Current docs no longer describe replay 002 v8 as accepted.
- Replay 002 is consistently recorded as not accepted.
- Task 094 is the replay-002 v9 terminal validation task.
- The selection-only Task 094 was superseded by the finite pilot plan.
- Spatial work is parked rather than the active tactical milestone.

## Obsolete Instructions Deprecated

`docs/CODEX_QUEUE_RUNNER.md` is now a historical notice. Current execution uses
`AGENTS.md`, `docs/codex/WORKFLOW.md`, and `tasks/specs/<id>.json`.

## Files Deliberately Preserved

Historical task reports, replay outputs, package-local files, package entry
points, package ESLint configs, proto sources, providers, and repository-audit
outputs were not deleted or moved.

## Cleanup Deferred

No phase from `output/repository-audit/cleanup-proposal.json` was executed.
Broad archival, deletion, compression, Git LFS migration, history rewriting,
and repository filtering remain deferred until after Task 096.

## Current Source Hierarchy

1. `docs/PROJECT_STATE.md`
2. `docs/NEXT_MILESTONE.md`
3. `docs/codex/CURRENT_STATE.md`
4. `tasks/specs/<id>.json`
5. task files and reports
6. output artifacts

Historical reports and outputs cannot override current project-state documents.

## Accepted Workflow Decision

Workflow gate `codex_task_workflow_optimization_ready_v3` is accepted for the
pilot. Its limitations remain documented in
`reports/codex-workflow-optimization-v3.md`.

## Pilot Membership

Included replays: `replay_001`, `replay_002`, `replay_003`, `replay_004`,
`replay_009`.

Excluded replays:

- `replay_005`: protected final holdout
- `replay_006`: unsupported bot fixture
- `replay_007`: unsupported bot fixture
- `replay_008`: unsupported bot fixture

## Task Sequence

- Task 094: finalize replay 002 terminal validation.
- Task 095: canonicalize remaining human pilot replays.
- Task 096: audit the five-human-replay factual pilot.

Do not create Task 097 automatically.

## Known Technical Debt

- Replay 002 terminal validation remains blocked until Task 094.
- The remaining human controls are not yet canonicalized.
- The five-replay pilot has not been audited.
- Spatial work, mechanic effects, ML, fights, rotations, pressure, macro, and
  decision analysis remain unavailable.

## Protections

No replay was accessed or processed. Replay 005 remains protected. Replays
006-008 remain unsupported. No factual replay output was modified.

## Validation

- `npm run validate:tasks`: passed.
- `npm run lint`: passed.
- JSON parse validation for new and modified task/pilot JSON: passed.
- Current artifact registry path existence check: passed for 11 entries.
- Markdown reference target spot-check: passed for task-added links.
- Forbidden-source/output diff check: no changes under replay samples,
  `output/replays/`, replay-002 factual outputs, replay-009 canonical outputs,
  canonical source, schemas, or workflow implementation files.
- `npm run check:outputs`: ran and reported the preexisting oversized
  `output/04-controller-pawn-lifecycle.json` file. Task 093 did not modify that
  file or any factual output.
