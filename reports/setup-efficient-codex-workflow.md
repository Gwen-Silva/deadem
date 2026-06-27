# Configuracao do fluxo eficiente do Codex

Status: completed

## Estrutura criada

- `AGENTS.md`
- `docs/`
- `tasks/pending/`
- `tasks/completed/`
- `reports/`
- Workflow validation scripts under `scripts/`

## Arquivos alterados

- `package.json`

## Scripts adicionados

- `scripts/validate-experiment.js`
- `scripts/check-output-sizes.js`
- `scripts/summarize-experiment.js`

## Validacoes executadas

- `npx.cmd eslint --config eslint.common.config.js scripts\validate-experiment.js scripts\check-output-sizes.js scripts\summarize-experiment.js`
- `npm.cmd run validate:experiment -- 23`
- `npm.cmd run check:outputs -- 23`
- `npm.cmd run summarize:experiment -- 23`
- Repository path check for docs, reports, tasks, scripts, latest experiment script, and experiment 23 outputs.
- Aggregate SHA-256 check over `output/*` before and after the task.

## Decisoes tomadas

- Repository docs are now the durable context source for future Codex runs.
- Existing `output/*` files were treated as immutable evidence.
- Validation scripts inspect experiments and outputs without running replay processing.
- Latest completed experiment is recorded as experiment 23.

## Limitacoes encontradas

- Reports for experiments 01 through 23 were not stored under `reports/`.
- Some older outputs are larger than the current 10 MiB limit; the new limit applies to new outputs unless explicitly approved.
- Lane occupancy is still not ready for reliable transition detection.

## Como usar a partir de agora

1. Create a task file from `tasks/TASK_TEMPLATE.md` when a request is large or multi-step.
2. Read `AGENTS.md`, the task file, and `docs/PROJECT_STATE.md` before acting.
3. Use `npm run validate:experiment -- <id>` for completed experiment validation.
4. Use `npm run check:outputs -- <id>` to verify output sizes for one experiment.
5. Use `npm run summarize:experiment -- <id>` for a compact inventory.
6. Write a report and update `reports/latest.md` after each completed task.

## Evidencias

- Latest completed experiment detected: `23-calibrate-lane-occupancy`.
- Experiment 23 validation parsed 10 JSON outputs successfully.
- Experiment 23 output size check found all 10 JSON outputs below 10 MiB.
- No replay-processing command was run.
- Existing `output/*` files were not modified.
