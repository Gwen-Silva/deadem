# Task Execution Policy

- Execute only explicitly authorized tasks.
- One task per commit.
- Do not execute blocked, backlog, or follow-up tasks without authorization.
- Use explicit staging.
- Keep changes inside the task's `writePaths`.
- Read only `readPaths` first; use `optionalReadPaths` only when necessary.
- `forbiddenPaths` override every other field.
- Create exactly one blocked follow-up when the task requires it.
- Handoff compactly and stop.

Required checks are task-specific, but ordinary code changes should run lint, focused tests, JSON/Markdown validation when applicable, task queue validation, and `npm run codex:review`.

Do not alter unrelated files or revert user changes. If unrelated dirty files exist, report them and leave them alone.
