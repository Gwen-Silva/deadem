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

backlog
```

- `pending`: fully specified and ready to execute.
- `active`: currently being executed.
- `completed`: acceptance criteria satisfied.
- `blocked`: cannot proceed without missing data, access, or a conceptual decision.
- `backlog`: future work that is not sufficiently specified or should not be scheduled yet.

Tasks are processed by ascending numeric ID. File modification time, alphabetical title, or perceived importance must not override the numeric order.

Task IDs and experiment IDs are separate namespaces. A task may implement a different experiment number, and queue order still follows the task ID in the filename.

## Queue Visibility

The autonomous runner may:

- list `tasks/pending/`
- select the lowest numeric pending task
- move that task to `tasks/active/`
- complete or block that task
- inspect `tasks/pending/` again

The autonomous runner must not:

- execute files in `tasks/blocked/`
- execute files in `tasks/backlog/`
- automatically promote blocked tasks
- automatically promote backlog tasks
- create future scientific tasks from a roadmap
- treat roadmap order as execution authorization
- continue to a human task
- remain idle waiting for a human gate

## Promotion Rules

A blocked task may move to `tasks/pending/` only when all declared dependencies are completed, gate evidence exists, the task objective and acceptance criteria are complete, the execution mode permits autonomous execution, and promotion is explicitly authorized by a user instruction or by a deterministic promotion rule already written in the task.

A backlog item may move to `tasks/pending/` or `tasks/blocked/` only after it has been converted into a fully specified task. Codex must not perform this conversion autonomously when scientific scope, thresholds, methodology, or priorities are still undecided.

Tasks with `Execution mode: human` must never be executed by the autonomous runner. They may remain in `tasks/blocked/` while waiting for human work. After the human gate is completed, a separate Codex task may verify the artifacts, but the queue runner must not fabricate, infer, or complete human labels.

## Evidence Escalation Before Human Review

Codex must exhaust available independent, reproducible, non-circular validation before requesting broad human review.

Human review should be requested only when:

- semantic ground truth cannot be derived from available data
- the unresolved distinction materially changes the next project decision
- the sample set has been minimized
- each requested review has an explicit question
- no deterministic or independent evidence can answer it

Codex must distinguish internal consistency, independent supporting evidence, independent contradictory evidence, semantic ground truth, and unresolved interpretation. Autonomous evidence may support or weaken a conclusion, but it must not be described as human ground truth.

Codex must not request human approval merely because a task was originally designed with a human gate.

## Parser Investigation Policy

After two sequential parser blockers at the same boundary, stop serial symptom repair and run an assessment experiment.

Parser investigations must not:

- fabricate entities
- create empty fabricated baselines
- substitute neighboring classes
- silently suppress warnings
- derive downstream semantic analysis from unstable continuation

Sequentially exposed parser errors at one boundary must be cataloged as related blockers until an assessment experiment distinguishes replay-specific data, build/protocol compatibility, parser state reconstruction, and packet-framing behavior. Do not add another local skip merely because a previous skip exposed the next symptom.

## Successful Stop Conditions

- no pending task
- next step requires a methodological decision
- next stage requires human labels
- a blocked gate has not been fulfilled
- only backlog items remain
- required input is unavailable
- evidence is contradictory
- replay reprocessing is required but not explicitly authorized
- previous outputs would need to be modified
- task acceptance criteria cannot be tested

Use:

```text
Stop reason: NO_EXECUTABLE_PENDING_TASK
```

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
