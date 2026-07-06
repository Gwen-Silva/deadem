# Task 126 - Restore Direct Codex Workflow

Status: completed

Gate: `direct_codex_workflow_restored`

## Objective

Restore the project from the abandoned iaflow/Product Reviewer/WSL automation route back to the direct GPT -> Codex workflow without parser work, replay processing, recovery, skip mode, or canonical/factual output.

## Result

The tracked iaflow automation was removed safely by a non-destructive reverse patch of local commit `fb1bd83690a8048a62c4445fda752f5f702e8964`.

The local `.iaflow-real-chrome/`, `.tmp/`, and `.pytest-tmp/` cleanup residue no longer appears in `git status`.

## Cleanup

Removed or reversed:

- tracked `ai-flow/**` automation files from the abandoned iaflow commit
- tracked `iaflow/**` package files from the abandoned iaflow commit
- tracked `tests/iaflow/test_iaflow.py`
- untracked `ai-flow/IAFLOW_OPERATOR_GUIDE.md`
- untracked `ai-flow/tasks/TASK-0126/`
- untracked `ai-flow/tasks/TASK-0128/`
- untracked `ai-flow/tasks/TASK-LOCAL-VALIDATION/05-codex-report.md`
- `.iaflow-real-chrome/`
- removable `.iaflow-browser/` and `.tmp` automation leftovers

Still requiring manual cleanup: none.

## Protections

- No WSL command was used.
- No iaflow command was used.
- No Product Reviewer automation was used.
- Parser and engine were not modified.
- No replay was processed.
- Replay 005 was not accessed.
- Replays 006-008 were not processed.
- Candidates 012-020 were not accessed.
- `samples/**` and `output/replays/**` were not used.
- Java was not installed or executed.
- Clarity was not executed.
- No recovery, skip mode, parser fix, canonical package, factual output, source artifact, spatial output, macro output, mechanics output, fight output, decision output, or ML output was created.
- Task 127 was not created.

## Next Step

Return to a direct GPT -> Codex task for the independent missing-entity strategy. Do not create Task 127 automatically.
