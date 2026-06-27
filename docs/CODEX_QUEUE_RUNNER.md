# Codex Queue Runner

Use this instruction in a new Codex thread to process the task queue.

## Execution loop

1. Read `AGENTS.md`.
2. Inspect only `tasks/pending/`.
3. Select the task with the lowest numeric ID.
4. If none exists, stop with `NO_EXECUTABLE_PENDING_TASK`.
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

The runner may list `tasks/pending/`, select the lowest numeric pending task, move that task to `tasks/active/`, complete or block that task, and inspect `tasks/pending/` again.

The runner must not execute files in `tasks/blocked/`, execute files in `tasks/backlog/`, automatically promote blocked tasks, automatically promote backlog tasks, create future scientific tasks from a roadmap, treat roadmap order as execution authorization, continue to a human task, or remain idle waiting for a human gate.

## Blocked task handling

When blocked:

1. Stop work on the task.
2. Create its blocking report.
3. Set its status to `blocked`.
4. Move it to `tasks/blocked/`.
5. Do not invent a methodological workaround.
6. Do not continue to dependent tasks.
7. Continue only to an independent pending task when independence is explicit.

A blocked task may move to `tasks/pending/` only when every declared dependency is completed, its gate evidence exists, its objective and acceptance criteria are complete, its execution mode permits autonomous execution, and promotion is explicitly authorized by a user instruction or by a deterministic promotion rule already written in the task.

A backlog item may move to `tasks/pending/` or `tasks/blocked/` only after it has been converted into a fully specified task. Codex must not perform this conversion autonomously when scientific scope, thresholds, methodology, or priorities are still undecided.

Tasks with `Execution mode: human` must never be executed by the autonomous runner. They may remain in `tasks/blocked/` while waiting for human work. After their human gate is completed, a separate Codex task may verify the artifacts, but the queue runner must not fabricate, infer, or complete human labels.

## Successful stop

Stop successfully with `NO_EXECUTABLE_PENDING_TASK` when `tasks/pending/` is empty, the next stage requires human labels, a blocked gate has not been fulfilled, only backlog items remain, or a methodological decision is required.

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
