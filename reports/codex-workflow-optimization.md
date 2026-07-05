# Codex Workflow Optimization

Gate: `codex_task_workflow_optimization_ready`

Task 090 creates a compact Codex workflow for future tasks. It does not repair the replay-002 v8 gate, does not process replays, and does not modify canonical factual outputs.

## Size Metrics

| Item | Size |
| --- | ---: |
| `AGENTS.md` | 2,521 bytes |
| `docs/codex/CURRENT_STATE.md` | 1,114 bytes |
| Task 091 context packet | 7,076 bytes |
| Task 091 review packet Markdown | 1,205 bytes |
| Task 091 review packet JSON | 4,456 bytes |

Task 091 declares 18 required read paths and 4 optional read paths. The workflow excludes 10 default large or sensitive directories from broad search. The current `output/` tree contains 1,578 historical files that future tasks should not read by default.

## Commands Added

- `npm run codex:prepare`
- `npm run codex:preflight`
- `npm run codex:validate`
- `npm run codex:review`
- `npm run codex:status`

## Limits Applied

- `AGENTS.md`: 8 KiB
- `docs/codex/CURRENT_STATE.md`: 4 KiB
- context packet: 16 KiB
- review packet Markdown: 24 KiB
- review packet JSON: 32 KiB
- new or modified large output threshold: 100 KiB unless explicitly allowed

## Validation Summary

Task 091 dry-run preflight and prepare passed without executing Task 091. Synthetic workflow tests covered valid and invalid specs, blocked-task dry-run behavior, forbidden replay paths, large-output authorization, context/review packet limits, regeneration policy checks, local-only packet handling, and protected replay extension checks.

The known historical oversized output `output/04-controller-pawn-lifecycle.json` remains preexisting and unchanged.

## Remaining Work

Task 091 remains blocked and must resolve the replay-002 terminal validation blockers. Task 092 remains blocked for next-control selection after Task 091 review.
