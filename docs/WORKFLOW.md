# Workflow

## Standard Process

1. Read `AGENTS.md`.
2. Read the active task under `tasks/pending/`, when present.
3. Read `docs/PROJECT_STATE.md`.
4. Read only task-relevant docs, reports, scripts, and outputs.
5. Implement the smallest isolated change that satisfies the task.
6. Run ESLint for changed JavaScript.
7. Validate JSON outputs with `JSON.parse` when outputs are created or inspected.
8. Check output sizes for relevant experiment files.
9. Write a short report in `reports/`.
10. Update `reports/latest.md`.

## Task Queue Lifecycle

```text
pending
   |
   v
active
   |
   v
completed

or

active
   |
   v
blocked
```

- `pending`: fully specified and ready to execute.
- `active`: currently being executed.
- `completed`: acceptance criteria satisfied.
- `blocked`: cannot proceed without missing data, access, or a conceptual decision.

Tasks are processed by ascending numeric ID. File modification time, alphabetical title, or perceived importance must not override the numeric order.

## Successful Stop Conditions

- no pending task
- next step requires a methodological decision
- required input is unavailable
- evidence is contradictory
- replay reprocessing is required but not explicitly authorized
- previous outputs would need to be modified
- task acceptance criteria cannot be tested

## When Dividir Uma Tarefa

Divide a task when it would require more than one of these at the same time:

- replay reprocessing
- parser/library changes
- new experiment outputs
- data dictionary changes
- manual Explorer validation
- report-only workflow maintenance

Each split task should have a clear input list, expected output files, validation commands, and stop conditions.

## O Que Nao Deve Entrar No Relatorio

- Full JSON output contents.
- Large tables copied from `output/*`.
- Unvalidated claims presented as facts.
- Chat history that is not needed to reproduce the work.
- Speculation about future parser or database designs.
- Raw replay data.
