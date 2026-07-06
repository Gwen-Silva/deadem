# Direct Codex Workflow Restoration

Task 126 attempted to restore the repository from the abandoned iaflow/Product Reviewer/WSL automation route back to the direct GPT -> Codex workflow.

Gate: `direct_codex_workflow_restored`

## Result

The tracked repository cleanup has been staged as a non-destructive reverse patch of local commit `fb1bd83690a8048a62c4445fda752f5f702e8964` (`Add browser-backed iaflow orchestrator`).

The local `.iaflow-real-chrome/`, `.tmp/`, and `.pytest-tmp/` cleanup residue no longer appears in `git status`. The remaining working tree changes are the intended Task 126 restoration changes.

## Before

- Branch: `main`
- Expected base: `0f7650b0fded0b278b7ce6cd12f57d006ac299d4`
- Initial HEAD: `fb1bd83690a8048a62c4445fda752f5f702e8964`
- `origin/main`: `0f7650b0fded0b278b7ce6cd12f57d006ac299d4`
- Local commit after expected base: `fb1bd83 Add browser-backed iaflow orchestrator`

## Cleanup Performed

- Restored dirty abandoned automation files to HEAD before cleanup.
- Removed untracked TASK-0128/TASK-0126/operator-guide artifacts.
- Applied `git revert --no-commit fb1bd83690a8048a62c4445fda752f5f702e8964` to remove tracked iaflow/browser/Product Reviewer automation without using destructive reset.
- Removed `.iaflow-browser/` and removable `.tmp` Playwright artifacts.

## Cleanup Blocker

No cleanup blocker remains.

No broad reset was performed. No parser, engine, replay, Clarity, Java, WSL, or Product Reviewer automation was used.

## Protections

- Parser and engine untouched.
- Replay 005 not accessed.
- Replays 006-008 not processed.
- Candidates 012-020 not accessed.
- `samples/**` and `output/replays/**` not used.
- Java not installed or executed.
- Clarity not executed.
- WSL not used.
- iaflow not used.
- Product Reviewer automation not used.
- No recovery, skip mode, parser fix, canonical package, factual output, source artifact, spatial, macro, mechanics, fight, decision, or ML output was produced.
- Task 127 was not created.

## Next Step

Return to direct GPT -> Codex task execution for the independent missing-entity strategy in a separate task. Do not create Task 127 automatically.
