# Codex Queue Runner

Use this instruction in a new Codex thread to process the task queue.

## Execution loop

1. Read `AGENTS.md`.
2. Inspect `tasks/pending/`.
3. Select the task with the lowest numeric ID.
4. If none exists, stop with `NO_PENDING_TASK`.
5. Move the task to `tasks/active/`.
6. Read `docs/PROJECT_STATE.md` and only the files listed in the task.
7. Execute the task completely.
8. Run required validations.
9. Correct failures within scope.
10. Generate the required report.
11. Update documentation only when required.
12. Stage only files belonging to the task.
13. Create one commit for the task.
14. Push to `origin/main`.
15. Move the task to `tasks/completed/`.
16. Check `tasks/pending/` again.
17. Continue only if another complete task exists.

## Blocked task handling

When blocked:

1. Stop work on the task.
2. Create its blocking report.
3. Set its status to `blocked`.
4. Move it to `tasks/blocked/`.
5. Do not invent a methodological workaround.
6. Do not continue to dependent tasks.
7. Continue only to an independent pending task when independence is explicit.

## Efficiency rules

- Do not read conversation history.
- Do not browse the full repository without a task requirement.
- Do not load large JSON files fully when metadata, streaming, targeted extraction, or sampling is sufficient.
- Do not narrate progress.
- Do not reproduce task instructions in reports.
- Do not copy full logs.
- Do not rerun unchanged validations unless a relevant file changed.
- Prefer derived outputs over replay reprocessing.
- Do not execute experiments merely to confirm that they still run.
- Keep the final response below 25 lines.
