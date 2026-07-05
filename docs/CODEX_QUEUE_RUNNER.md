# Codex Queue Runner Deprecated

This document is a historical workflow record.

It must not be used for current execution. Tasks are now explicitly authorized
through `tasks/specs/`, with compact context prepared by the accepted Codex
workflow v3.

Current execution instructions are:

- `AGENTS.md`
- `docs/codex/WORKFLOW.md`
- the authorized `tasks/specs/<id>.json`

Codex must execute only the authorized task and stop after the handoff. It must
not automatically continue through a queue, promote blocked tasks, or create a
new follow-up unless the active task explicitly requires it.

The original queue-runner content remains available through Git history.
