# Codex Workflow Optimization v2

Task 091 hardened the compact Codex workflow created by Task 090. It did not process replays, regenerate canonical outputs, alter replay facts, or repair the replay-002 v8 gate.

## Enforcement Changes

- Dry-run `prepare` and `preflight` now stay in memory and do not write `.local` files.
- Path resolution is centralized through a realpath-aware containment helper for existing files and future write paths.
- Review now fails closed unless a current, passing `validate-result.json` exists for the same base and current commit.
- Required checks use explicit identities and a controlled command allowlist.
- Gates come from task specs or an explicit JSON gate source, not hard-coded replay-v8 filenames.
- Protected replay references are rejected across task path fields, and `.dem` paths remain globally forbidden.

## Measured Limits

- `AGENTS.md`: 2,521 bytes, under 8 KiB.
- `docs/codex/CURRENT_STATE.md`: 1,194 bytes, under 4 KiB.
- Task 091 context packet: 5,112 bytes.
- Task 092 dry-run context packet: 7,268 bytes.
- Task 091 review packet: 629 bytes Markdown and 3,760 bytes JSON.
- Review packets are capped at 24 KiB Markdown and 32 KiB JSON.
- New or modified large outputs above 100 KiB require explicit `largeOutputsAllowed`.

## Validation Evidence

- Focused workflow tests: 40 passed, 1 symlink test skipped because Windows symlink creation was unavailable in the sandbox.
- Task 092 dry-run preflight: passed without writing a context packet.
- Task 092 dry-run prepare: produced an in-memory packet hash and preview only.
- `npm.ps1` is blocked by the local PowerShell execution policy, so shell invocations used `npm.cmd`; the workflow still records declared `npm run ...` checks internally.

## Limitations

The workflow controls files and commands that pass through `scripts/codex-workflow.js`. It does not intercept arbitrary shell commands run outside the workflow. `AGENTS.md` remains the behavioral rule for the agent, and review packets are evidence for scoped execution rather than an absolute sandbox guarantee.

## Gate

`codex_task_workflow_optimization_ready_v2`

## Follow-up

Task 092 remains blocked for replay-002 terminal validation gaps. Task 093 remains blocked for next-control selection after Task 092 review.
