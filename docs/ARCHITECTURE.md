# Architecture

## Repository Shape

- `packages/`: library and UI workspace packages.
- `samples/`: replay samples such as `samples/partida_001.dem`.
- `experiments/`: isolated numbered scripts for replay-derived investigations.
- `output/`: generated JSON outputs from experiments.
- `scripts/`: lightweight validation and workflow helpers.
- `docs/`: durable project context for future Codex runs.
- `tasks/`: pending and completed task records.
- `reports/`: task reports and the latest report pointer.

## Data Flow

Replay data starts in `samples/partida_001.dem`.

Experiment scripts read the replay or earlier derived outputs, then write numbered JSON files under `output/`. Later experiments should prefer stable derived files over rereading the replay when the task allows it.

Typical flow:

`samples/partida_001.dem` -> `experiments/NN-*.js` -> `output/NN-*.json` -> later `experiments/MM-*.js`

## Data Origin

- Raw replay origin: `samples/partida_001.dem`
- Parser/API origin: repository packages and official examples.
- Derived data origin: numbered experiment scripts.
- Human/context origin: reports, decisions, and task files.

## Scripts, Outputs, And Validations

The workflow helper scripts do not run experiments:

- `scripts/validate-experiment.js`: lints one experiment script and parses its matching JSON outputs.
- `scripts/check-output-sizes.js`: checks JSON output sizes against the 10 MiB limit.
- `scripts/summarize-experiment.js`: prints script/output inventory for one experiment.

Experiment scripts own the outputs with their same numeric prefix. Validation scripts only inspect existing files.

## Derived Files

Files in `output/` are derived artifacts. Treat them as immutable evidence unless a task explicitly asks to regenerate a specific experiment.

Reports in `reports/` are summaries and should not be used as a substitute for machine-readable outputs when exact values matter.

## Files Not To Modify Casually

- `output/*`: preserve existing outputs.
- `samples/*`: replay input data.
- Parser/library source under `packages/`: change only for explicit library tasks.
- Existing experiment scripts: change only for a specific correction or follow-up.

## Adding A New Experiment

1. Create `experiments/NN-short-description.js`.
2. Read only the replay or outputs needed by the task.
3. Write outputs as `output/NN-short-description.json` or a small set of `output/NN-*.json` files.
4. Keep each new JSON output below 10 MiB unless approved.
5. Run ESLint and JSON parsing validation.
6. Add or update a report in `reports/`.
7. Update `docs/PROJECT_STATE.md` and `docs/EXPERIMENT_INDEX.md` when the experiment changes project state.
