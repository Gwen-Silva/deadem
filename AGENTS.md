# Codex Operating Rules

This repository is the source of truth for future Codex runs.

When repository docs exist, prefer them over conversation history. Conversation history can explain why a task exists, but repo files define the current state.

## Context Reading Order

1. `AGENTS.md`
2. The active task file, when one exists under `tasks/pending/`
3. `docs/PROJECT_STATE.md`
4. Only the docs, reports, scripts, and outputs listed by the task

Avoid loading large `output/*.json` files unless the task explicitly requires them.

## Execution Rules

- Keep experiments isolated under `experiments/`.
- Do not change the parser or package source unless the task explicitly asks for it.
- Do not implement a database unless the task explicitly asks for it.
- Do not reprocess `samples/partida_001.dem` for workflow, documentation, or reporting tasks.
- Preserve existing `output/*` files. New experiments may add new outputs with a new numbered prefix.
- Use the package manager already used by the repo.
- Use Node.js scripts and the existing ESLint style unless the repo indicates a better local pattern.
- Keep Windows compatibility in commands and scripts.

## Report Rules

- Every completed task should leave a short report in `reports/`.
- `reports/latest.md` should point to the most recent report.
- Reports should summarize what changed, which commands ran, what was validated, and what remains uncertain.
- Reports should not duplicate large JSON output or paste long generated data.

## Validation Limits

- Validate changed JavaScript with ESLint.
- Validate generated JSON with `JSON.parse`.
- Keep new JSON outputs below 10 MiB unless a task explicitly approves a larger file.
- For validation-only work, confirm that existing outputs were not altered.
