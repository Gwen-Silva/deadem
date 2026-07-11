# Task 191 — Autonomous Work–Codex Coordination Policy

This is a Codex execution claim for independent validation, not acceptance.

## Resumo objetivo

Implemented the coordination policy, deterministic post-commit candidate
resolution, immutable accepted-base checks, structural execution evidence and
fail-closed workflow behavior for the corrective Task 191 execution.

## Commit

- Candidate SHA resolution: post-commit-attestation: .local/codex/191/post-commit-attestation.json
- Commit-base: 13a3da64bcf0ba839a752038f07f40e3eeeed890
- Branch: task191-correction
- Commits adicionados: 1
- Message: `Implement autonomous Work Codex coordination policy`.

## Arquivos alterados

- `AGENTS.md`
- `package.json`
- `scripts/codex-workflow.js`
- `scripts/validate-project-coordination.js`
- `scripts/validate-task-queue.js`
- `schemas/project-coordination-state.schema.json`
- `schemas/task-execution-contract.schema.json`
- `data/project-coordination-state.json`
- `data/task-contribution-index.json`
- `data/capability-index.json`
- `data/current-artifact-registry.json`
- `docs/codex/AUTONOMOUS_COORDINATION_POLICY.md`
- `docs/codex/TASK_INSTRUCTION_TEMPLATE.md`
- `docs/codex/CODEX_REPORT_TEMPLATE.md`
- `docs/codex/WORKFLOW.md`
- `docs/codex/TASK_EXECUTION.md`
- `docs/codex/CURRENT_STATE.md`
- `docs/PROJECT_STATE.md`
- `docs/NEXT_MILESTONE.md`
- `docs/CAPABILITY_MAP.md`
- `tests/project-coordination-policy.test.mjs`
- `tests/codex-workflow-coordination.test.mjs`
- `tests/task-execution-contract.test.mjs`
- `tasks/specs/191.json`
- `tasks/completed/191-autonomous-work-codex-coordination-policy.md`
- `reports/autonomous-work-codex-coordination-policy-task191.md`
- `output/project-coordination/task191-gate.json`
- `output/project-coordination/task191-summary.json`

## Mudanças implementadas

Separated Work, Codex and Chat; added state machine, contract v1, ordered
context packet, full report checklist, queue validation, self-approval
protection and honest `BLOCKED_BY_SURFACE` handling.

## Comandos executados

- Git base, merge-base, commit-count, branch, HEAD, remote and worktree checks.
- `node --check` for both workflow validators.
- Each of the three focused `node --test` commands.
- `npm run validate:coordination` and `npm run validate:tasks`.
- `npm run codex:prepare -- --task 191` and preflight with the explicit accepted base.
- `npm run lint` and `npm run check:outputs`.
- `npm run codex:validate -- --task 191 --base 13a3da64bcf0ba839a752038f07f40e3eeeed890` and
  `npm run codex:review -- --task 191 --base 13a3da64bcf0ba839a752038f07f40e3eeeed890` are executed in
  the final fingerprint cycle and recorded in `.local/codex/191/`.

## Testes e validações

- Focused policy tests: 6/6 passed, exit 0.
- Focused workflow tests: 9/9 passed, exit 0, including stale/local/absent
  remote evidence, unverified push overrides and Work-accepted Task 191 to
  READY_FOR_CODEX Task 192 continuation.
- Focused contract/report/queue tests: 8/8 passed, exit 0.
- Coordination validation, queue validation, prepare, preflight, lint and
  output-size validation passed with exit 0.
- Context packet: 9,340 bytes in the clean post-commit cycle, below the 16 KiB limit.
- Queue validation traverses exactly the 100 historical specs from 091 through
  190 and separately validates future contract rules.
- Negative workflow tests verify that `passed: false` maps to process exit 1.
- Build: not_applicable: governance-only change
- Lint: passed
- Typecheck: not_applicable: no repository typecheck command

## Artifacts gerados

- Versioned policy, templates, schemas, coordination state, validators, tests,
  Task 191 record, report, gate and summary.
- Local context, preflight, validation, review and post-commit attestation
  packets under `.local/codex/191/`.

## Limitações

The repository does not create a real ChatGPT Work or Codex surface
integration. It can only validate and preserve coordination instructions and
state. The versioned report cannot contain the SHA of the commit that contains
the report itself; the final handoff supplies that verified SHA.

## Riscos

- Repository scripts cannot intercept direct commands outside the workflow or
  prove external surface activity.
- Future policy evolution must preserve legacy compatibility or explicitly
  version a new contract.

## Desvios

No authorized scope deviation.

## Não validado

- Independent ChatGPT Work acceptance is not validated by Codex.
- A real cross-surface launch was not tested because no such repository
  integration was created or claimed.

## Gate técnico alegado

`autonomous_work_codex_coordination_policy_ready`

- Technical gate claim: autonomous_work_codex_coordination_policy_ready

Final acceptance remains pending independent ChatGPT Work validation.

## Push e estado final

- Push status: not_attempted: versioned report freeze precedes optional authorized branch push
- HEAD source: post-commit-attestation
- Origin ref: origin/task191-correction
- Final status: VALIDATING

The post-commit attestation records the real full HEAD, remote observation and
clean `git status --short` result. It never treats HEAD or push as acceptance.
