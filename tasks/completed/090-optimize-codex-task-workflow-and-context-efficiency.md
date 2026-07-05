# Task 090: Optimize Codex Task Workflow And Context Efficiency

Status: completed

Execution mode: autonomous after explicit authorization

## Objective

Create a compact, reusable Codex workflow that reduces context loading, centralizes project policies, validates task specs, generates bounded context/review packets, and preserves replay/output protections.

## Created Files

- `AGENTS.md`
- `docs/codex/*`
- `tasks/specs/*`
- `scripts/codex-workflow.js`
- `tests/codex-workflow/*`
- `reports/codex-workflow-optimization.md`

## Commands

- `npm run codex:prepare`
- `npm run codex:preflight`
- `npm run codex:validate`
- `npm run codex:review`
- `npm run codex:status`

## Limits

`AGENTS.md` is capped at 8 KiB, `docs/codex/CURRENT_STATE.md` at 4 KiB, context packets at 16 KiB, Markdown review packets at 24 KiB, and JSON review packets at 32 KiB.

## Output Policy

`.local/` is ignored and stores logs, packets, reruns, and temporary review material. Large new or modified outputs require explicit `largeOutputsAllowed` authorization.

## Validation

Synthetic workflow tests, dry-run Task 091 preparation/preflight, lint, task queue validation, and output-size checks were run. The known historical oversized output remains preexisting.

## Gate

`codex_task_workflow_optimization_ready`

## Follow-up

Task 091 remains blocked for terminal replay-002 validation gaps. Task 092 remains blocked for next-control selection after Task 091 review.
