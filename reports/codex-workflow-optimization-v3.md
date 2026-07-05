# Codex Workflow Optimization v3

Task 092 closes the workflow lifecycle and stale-review gaps left after Task 091. It did not process replays, modify canonical factual outputs, change canonical contracts, or repair replay-002 validation.

## Lifecycle Enforcement

Real `prepare`, `preflight`, `validate`, and `review` execution is limited to specs with status `authorized` or `active`. Blocked, pending, and completed specs are dry-run only, except for a declared final validation transition that lets a completing task validate after setting its own status to `completed`.

Task 091 is now `completed`. Task 093 and Task 094 remain `blocked`.

## Validation Fingerprint

Validation records full base/head commits, task-spec hash, workflow-script hash, Git-status hash, changed-file records, file sizes, file hashes, removals, renames, staged files, unstaged files, and untracked files. Review recomputes the same fingerprint and fails closed if anything changes after validation.

## Structured Checks

Task checks now use structured records:

- `npm-script`
- `node-test`
- `eslint`
- workflow dry-run actions

Free-form command strings, metacharacters, absolute paths, traversal, and tests outside `tests/` are rejected.

## Windows Safety

Node checks use `process.execPath` with argument arrays and `shell: false`. NPM scripts are restricted to allowlisted package script names before Windows invokes `npm.cmd`; no arbitrary spec field becomes a shell string.

## Tests

The focused workflow suite executed 52 tests: 51 passed and one symlink escape test was skipped because symlink creation was unavailable in the Windows sandbox.

Covered areas include lifecycle states, stale review detection, structured check rejection, protected replay paths, `.dem` rejection, expected outputs, compact packet limits, and integrated `validateTask()` plus `review()` flows.

## Limits

Compact limits remain unchanged: `AGENTS.md` below 8 KiB, `CURRENT_STATE.md` below 4 KiB, context packets below 16 KiB, review Markdown below 24 KiB, review JSON below 32 KiB, and large output authorization at 100 KiB.

Measured in this run:

- `AGENTS.md`: 2,521 bytes.
- `docs/codex/CURRENT_STATE.md`: 1,194 bytes.
- Task 092 dry-run context packet: 5,470 bytes.
- Task 092 review packet: 645 bytes Markdown and 4,684 bytes JSON.

## Gate

`codex_task_workflow_optimization_ready_v3`

## Follow-up

Task 093 is blocked for replay-002 terminal validation. Task 094 is blocked for next-control selection after Task 093 review.
