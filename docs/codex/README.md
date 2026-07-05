# Codex Workflow Policies

This directory holds reusable instructions for future Codex tasks. Keep `AGENTS.md` short and link here instead of copying policy text into every task.

- `WORKFLOW.md`: task start, context preparation, validation, review packet, commit, and handoff.
- `REPLAY_PROTECTION.md`: protected replay and unsupported fixture rules.
- `EPISTEMIC_SAFETY.md`: factual versus interpretive boundaries.
- `TASK_EXECUTION.md`: authorization, task queue, staging, validation, and stop conditions.
- `OUTPUT_AND_ARTIFACT_POLICY.md`: local-only artifacts, output-size rules, and regeneration policy.
- `CURRENT_STATE.md`: compact current project state for new sessions.

Use `tasks/specs/<task-id>.json` plus `npm run codex:prepare -- --task <task-id>` to build a bounded context packet.
