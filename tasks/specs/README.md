# Task Specs

Task specs define the bounded context and file scope for future Codex runs. They are not execution authorization by themselves.

Use:

```text
npm run codex:prepare -- --task <id>
npm run codex:preflight -- --task <id> --dry-run
```

Rules:

- `readPaths` are the initial context.
- `optionalReadPaths` require a reason before use.
- `writePaths` bound all intended changes.
- `forbiddenPaths` always win.
- `largeOutputsAllowed` is required for new or modified files above 100 KiB.
- `replayProcessingAllowed` defaults to `false`.
- `requiredCommands` use explicit check IDs and structured types: `npm-script`, `node-test`, `eslint`, or workflow dry-runs.
- `successGate`, `blockedGate`, and `gateSource` define how review derives the task gate.
- real execution is limited to `authorized` or `active` specs; blocked/pending/completed specs are dry-run only unless an explicit final validation transition is declared.
- blocked tasks may be dry-run validated but not executed.
- the spec file name and `taskId` must match.
