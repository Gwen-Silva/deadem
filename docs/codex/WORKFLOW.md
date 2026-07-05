# Codex Task Workflow

Start each task in a new session when possible. Do not paste full conversation history, large outputs, or logs into the prompt. Use `docs/codex/CURRENT_STATE.md`, the task spec, and the generated context packet.

Recommended start prompt:

```text
Execute Task <id> using tasks/specs/<id>.json.
Run codex:prepare first.
Read only the context packet and required paths.
Do not execute the follow-up task.
```

## Steps

1. Run `npm run codex:prepare -- --task <id>` or `--dry-run` for a blocked future task.
2. Read `.local/codex/<id>/context-packet.md`.
3. Open only required paths. Use optional paths only with a recorded reason.
4. Implement scoped changes.
5. Run `npm run codex:preflight -- --task <id>` and task-required checks.
6. Run `npm run codex:validate -- --task <id> --base <commit>` when changes exist.
7. Run `npm run codex:review -- --task <id> --base <commit>`.
8. Stage explicitly, commit once, push only when requested.
9. Handoff using the compact format from the review packet.

## Stop Conditions

Stop when no authorized pending task remains, the next task is blocked, a human/research gate is missing, a task requires semantic ground truth unavailable from current evidence, or validation fails in a way outside the authorized scope.

Do not use multiple agents for small related changes. Do not run tasks in parallel when they touch related files.

## Enforcement Limits

The workflow tool validates task specs, declared paths, command checks, generated packets, and changed files that pass through `scripts/codex-workflow.js`. It does not intercept arbitrary commands run directly outside the workflow.

`AGENTS.md` remains the behavioral rule for the agent. The workflow checks are guardrails and review evidence, not an absolute sandbox for unregistered shell activity.

Search guidance is operational policy unless a command is executed through the workflow. Prefer targeted `rg` and file reads over broad repository scans, and keep excluded directories out of manual searches.
