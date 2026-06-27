# Task 013: Diagnose lane occupancy episode regression

Status: completed
Execution mode: autonomous
Project stage: Lane occupancy validation
Related experiment: 24
Priority: high
Depends on: task 006
Unlocked by: task 006 gate equals failed_on_holdout with point-level improvement and episode-level regression
Blocks: model-revision decision

## Objective

Determine exactly why the revised point model generalizes while the revised episode model fails.

Preserve valid point-level corrections. Do not perform another broad combined revision until the episode regression has been decomposed through controlled ablation.

## Context to read

Read only:

- `AGENTS.md`
- `docs/PROJECT_STATE.md`
- `docs/DECISIONS.md`
- `reports/24-lane-occupancy-model-revision.md`
- `reports/24-occupancy-holdout-validation.md`
- `tasks/completed/005-revise-lane-occupancy-model.md`
- `tasks/completed/006-validate-occupancy-holdout.md`
- `experiments/24-revise-lane-occupancy-model.js`
- `experiments/24-validate-occupancy-holdout.js`
- `experiments/23-calibrate-lane-occupancy.js`, only where episode generation is directly relevant
- baseline and revised occupancy artifacts
- holdout sample set
- original and revised holdout evidence audits
- revision comparison and gate files

Do not inspect unrelated experiments.

## Work requested

Test the provisional hypothesis:

```text
Point-level conservative corrections are useful, but the revised episode construction incorrectly treats abstentions, interruptions, or continuity gaps, causing episode truncation and contradiction inflation.
```

Do not accept the hypothesis without ablation evidence.

Classify all 75 revised holdout episode contradictions into measurable categories and evaluate controlled ablation candidates.

## Constraints

- Do not reactivate task 005 or overwrite its completed state.
- Do not promote transition detection, second-replay processing, or human labeling.
- Do not claim semantic correctness.
- Do not use internal score alone.
- Do not overwrite previous outputs.
- Do not reprocess the replay.

## Inputs

- `output/24-holdout-sample-set.json`
- `output/24-holdout-original-evidence-audit.json`
- `output/24-holdout-revised-evidence-audit.json`
- `output/24-holdout-comparison.json`
- `output/24-holdout-validation-gate.json`
- `output/24-occupancy-revision-comparison.json`
- `output/24-occupancy-revision-gate.json`
- `output/24-revised-lane-occupancy.json`
- `output/24-revised-occupancy-episodes.json`
- `output/23-calibrated-lane-occupancy.json`
- `output/23-calibrated-occupancy-episodes.json`
- `output/18-player-movement-metrics.json`

## Outputs

- `experiments/24-diagnose-lane-occupancy-episode-regression.js`
- `output/24-episode-regression-diagnosis.json`
- `output/24-episode-regression-summary.json`
- `output/24-episode-ablation-candidates.json`
- `output/24-episode-ablation-comparison.json`
- `output/24-episode-reconstruction-candidate.json`
- `output/24-episode-revision-gate.json`
- `reports/24-episode-regression-diagnosis.md`

## Acceptance criteria

The task is complete when:

- all revised holdout episode contradictions are categorized
- each category includes measurements and suspected cause
- ablation candidates answer specific causal questions
- point-level gains are preserved as a separate requirement
- the task produces exactly one allowed gate result
- no fresh holdout is silently validated inside this task
- outputs parse and stay below 10 MiB

## Required validation

Run:

```bash
node node_modules\eslint\bin\eslint.js -c eslint.common.config.js experiments\24-diagnose-lane-occupancy-episode-regression.js
node experiments/24-diagnose-lane-occupancy-episode-regression.js
node -e "for (const f of ['output/24-episode-regression-diagnosis.json','output/24-episode-regression-summary.json','output/24-episode-ablation-candidates.json','output/24-episode-ablation-comparison.json','output/24-episode-reconstruction-candidate.json','output/24-episode-revision-gate.json']) JSON.parse(require('node:fs').readFileSync(f, 'utf8'));"
npm.cmd run check:outputs -- 24
npm.cmd run validate:tasks
```

Confirm prior outputs were not modified.

## Gate result

Allowed machine-readable results:

- `episode_revision_ready_for_fresh_holdout`
- `episode_revision_requires_human_semantics`
- `episode_revision_blocked_insufficient_data`
- `episode_revision_failed`

## Documentation updates

Create `reports/24-episode-regression-diagnosis.md` and update `reports/latest.md`.

Update `docs/PROJECT_STATE.md` and `docs/DECISIONS.md` only when justified.

## Git scope

Only task 013 artifacts, reports, docs when justified, and queue updates.

## Expected report

Include why the earlier revision appeared successful, why it failed on holdout, category distribution, causal contribution of each correction, ablation results, point-versus-episode trade-off, coverage-versus-abstention trade-off, selected reconstruction if any, rejected alternatives, data leakage controls, remaining uncertainty, and gate result.

## Stop conditions

Stop if the diagnosis would require semantic labels, replay reprocessing, or a fresh holdout cannot be created without overlap.
