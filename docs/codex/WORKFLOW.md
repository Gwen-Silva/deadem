# Codex Task Workflow

The normative authority is
`docs/codex/AUTONOMOUS_COORDINATION_POLICY.md`; machine-readable continuity is
`data/project-coordination-state.json`. Start each separately authorized Codex
task in a new execution when possible.

## Routing

ChatGPT Work performs discovery, research, planning, independent validation,
gate decisions, state maintenance and next-task selection. Pure research,
reading, comparison, review or report work remains in Work. Hybrid work starts
with Work analysis; Codex receives only the smallest technical unit.

Codex implements and reports. It does not execute a follow-up inside the same
execution. After Work validates an accepted gate, Work may automatically start
a new, separately authorized Codex execution without an intermediate routing
choice by Gwen.

Chat presents results and material blockers. When an actual integration exists,
Chat does not ask Gwen to copy instructions between surfaces. When the surface
cannot start Codex, record `BLOCKED_BY_SURFACE` and preserve the prepared
instruction and state. Never describe a prepared instruction as sent or an
unavailable integration as invoked.

## Steps

1. Read coordination state; verify branch and expected base equal the last
   accepted commit.
2. Run `npm run codex:prepare -- --task <id>`.
3. Read `.local/codex/<id>/context-packet.md` and required paths only.
4. Implement within `writePaths`; forbidden paths always override scope.
5. Run `npm run codex:preflight -- --task <id>` and mandatory checks.
6. Run `npm run codex:validate -- --task <id> --base <accepted-commit>`.
7. Run `npm run codex:review -- --task <id> --base <accepted-commit>`.
8. Stage explicitly, create one commit and push only when authorized.
9. Report execution using `docs/codex/CODEX_REPORT_TEMPLATE.md`, leave the task
   `VALIDATING`, and stop.

For `coordinationPolicyVersion: 1`, the context packet begins with the fifteen
ordered contract blocks from `TASK_INSTRUCTION_TEMPLATE.md`. It separately
shows the Work-accepted commit, task base, coordination status, acceptance
authority, Codex execution claim and pending Work validation.

Execution without `--dry-run` remains limited to executable spec lifecycle
states. Historical specs 000–190 retain their legacy contract. Executable
specs 191+ require contract v1.

## Evidence And Review

`validate` fingerprints base, current commit, spec, workflow, Git status and
changed files. `review` recomputes the fingerprint, verifies the full report
checklist and emits an execution packet. A technical gate is a Codex claim; it
does not mutate `lastAcceptedCommit` or replace Work validation.

Logs stay under `.local/codex/<task>/logs/`. The workflow validates declared
paths and checks but cannot intercept arbitrary commands or create cross-surface
integration.

## Stop Conditions

Stop on base or branch divergence, invalid state, rejected/blocked gate,
protected scope, unexpected historical regression, missing authority, or
validation failure outside scope. Do not self-authorize an alternative or a
follow-up.
