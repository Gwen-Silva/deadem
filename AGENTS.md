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

## Autonomous task execution

- The repository is the source of truth.
- Codex may execute multiple tasks in one session only when each task already exists in `tasks/pending/`.
- Every task must have a complete objective, explicit context, constraints, validation steps, and acceptance criteria.
- The autonomous runner may list only `tasks/pending/`, select the pending task with the lowest numeric ID, move that task to `tasks/active/`, complete or block that task, and inspect `tasks/pending/` again.
- Move it to `tasks/active/` before execution.
- Read only `AGENTS.md`, `docs/PROJECT_STATE.md`, the active task, and files explicitly listed by that task.
- Complete implementation, validation, corrections, reporting, documentation updates, commit, and push before selecting another task.
- Move successful tasks to `tasks/completed/`.
- Move blocked tasks to `tasks/blocked/`.
- Continue automatically only when another fully specified task already exists in `tasks/pending/`.
- Do not execute files in `tasks/blocked/`.
- Do not execute files in `tasks/backlog/`.
- Do not automatically promote blocked tasks.
- Do not automatically promote backlog tasks.
- Never create a new scientific or methodological task based solely on Codex conclusions.
- Do not treat roadmap order as execution authorization.
- Do not continue to a human task.
- Do not remain idle waiting for a human gate.
- Stop when no pending task exists, only backlog items remain, a blocked gate has not been fulfilled, the next stage requires human labels, or a methodological decision is required.
- An empty queue is a successful stop condition.
- Do not use Chrome or Computer Use to look for new instructions.
- Do not remain idle waiting for messages.
- Exhaust available independent, reproducible, non-circular validation before requesting broad human review.
- Treat human review as an escalation mechanism, not as the default next step, unless semantic ground truth cannot be derived from available data and the unresolved distinction materially changes the next project decision.

Use this stop reason for a successful empty or gated queue:

```text
Stop reason: NO_EXECUTABLE_PENDING_TASK
```

## Task locations

- `tasks/pending/`: fully specified tasks that can be executed now.
- `tasks/active/`: the single task currently being executed.
- `tasks/completed/`: tasks whose acceptance criteria were satisfied.
- `tasks/blocked/`: sufficiently specified tasks prevented only by an explicit unmet gate, missing input, human action, or research dependency.
- `tasks/backlog/`: future work that is not yet sufficiently specified or should not be scheduled yet.

Task IDs and experiment IDs are separate namespaces. Task ordering is based on the task ID in the filename, not the related experiment number.

## Promotion rules

A blocked task may move to `tasks/pending/` only when:

1. every declared dependency is completed;
2. its gate evidence exists;
3. its objective and acceptance criteria are complete;
4. its execution mode permits autonomous execution;
5. promotion is explicitly authorized by a user instruction or by a deterministic promotion rule already written in the task.

A backlog item may move to `tasks/pending/` or `tasks/blocked/` only after it has been converted into a fully specified task. Codex must not perform this conversion autonomously when scientific scope, thresholds, methodology, or priorities are still undecided.

Tasks with `Execution mode: human` must never be executed by the autonomous runner. They may remain in `tasks/blocked/` while waiting for human work. After their human gate is completed, a separate Codex task may verify the artifacts, but the queue runner must not fabricate, infer, or complete human labels.

## Evidence escalation

Codex must distinguish:

- internal consistency
- independent supporting evidence
- independent contradictory evidence
- semantic ground truth
- unresolved interpretation

Autonomous evidence may increase or decrease confidence, but it must not be described as human ground truth. Codex must not request human approval merely because a task was originally designed with a human gate.

Human review should be requested only when:

- semantic ground truth cannot be derived from available data;
- the unresolved distinction materially changes the next project decision;
- the sample set has been minimized;
- each requested review has an explicit question;
- no deterministic or independent evidence can answer it.

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
