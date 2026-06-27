# Task 006: Validate occupancy holdout

Status: completed
Execution mode: autonomous
Project stage: Lane occupancy validation
Related experiment: 24
Priority: high
Depends on: task 005
Unlocked by: `output/24-occupancy-revision-gate.json` gate equals `revision_ready_for_holdout` and revised artifacts exist
Blocks: task 007 or task 009

## Objective

Validate the revised model with a non-circular autonomous holdout audit using point seconds and episode windows that were not used to choose revision rules or parameters.

The validation must preserve distributions by:

- lane
- player
- match phase
- state
- episode duration

It must compare the original and revised models.

## Context to read

Read only:

- `AGENTS.md`
- `docs/PROJECT_STATE.md`
- `tasks/pending/006-validate-occupancy-holdout.md`
- `reports/24-lane-occupancy-model-revision.md`
- `output/24-occupancy-revision-baseline.json`
- `output/24-occupancy-revision-comparison.json`
- `output/24-occupancy-revision-gate.json`
- `output/24-revised-lane-occupancy.json`
- `output/24-revised-occupancy-episodes.json`
- `output/24-revised-autonomous-point-evidence-audit.json`
- `output/24-revised-autonomous-episode-evidence-audit.json`
- `output/24-revised-occupancy-sensitivity-analysis.json`
- existing geometry, topology, movement, and region outputs needed to apply the same autonomous evidence rules

## Work requested

Create a dedicated holdout script that:

- selects previously unused point seconds and episode windows from the existing derived data
- excludes all sample IDs, point seconds, and episode windows used by task 008 and task 005 candidate evaluation
- preserves distributions by lane, player, match phase, state, and episode duration where possible
- compares original experiment 23 classifications against the revised model
- applies autonomous independent-evidence rules without semantic labels
- reports contradictions, instability, abstention change, coverage change, and fragmentation change
- produces a conservative gate without promoting transition detection

## Constraints

- Do not define final numeric acceptance thresholds unless already documented by a prior decision.
- Record missing thresholds as a methodological gate instead of inventing values.
- Do not use human semantic labels.
- Do not request broad human review.
- Do not promote transition detection.

## Inputs

- `output/24-revised-lane-occupancy.json`
- `output/24-revised-occupancy-episodes.json`
- `output/24-occupancy-revision-comparison.json`
- existing derived movement, region, and geometry outputs

## Outputs

- `experiments/24-validate-occupancy-holdout.js`
- `output/24-holdout-sample-set.json`
- `output/24-holdout-original-evidence-audit.json`
- `output/24-holdout-revised-evidence-audit.json`
- `output/24-holdout-comparison.json`
- `output/24-holdout-validation-gate.json`
- `reports/24-occupancy-holdout-validation.md`

## Acceptance criteria

Original and revised models are compared on holdout samples not used to choose revision rules or parameters.

## Required validation

Run:

```bash
node node_modules\eslint\bin\eslint.js -c eslint.common.config.js experiments\24-validate-occupancy-holdout.js
node experiments/24-validate-occupancy-holdout.js
node -e "for (const f of ['output/24-holdout-sample-set.json','output/24-holdout-original-evidence-audit.json','output/24-holdout-revised-evidence-audit.json','output/24-holdout-comparison.json','output/24-holdout-validation-gate.json']) JSON.parse(require('node:fs').readFileSync(f, 'utf8'));"
npm.cmd run check:outputs -- 24
npm.cmd run validate:tasks
```

## Gate result

Allowed machine-readable results:

- `approved_on_holdout`
- `failed_on_holdout`
- `insufficient_holdout_labels`
- `methodological_gate_missing_thresholds`

## Documentation updates

Create `reports/24-occupancy-holdout-validation.md` and update `reports/latest.md`.

## Git scope

Only task 006 artifacts, report files, and queue updates.

## Expected report

Summarize holdout coverage, original-versus-revised comparison, and gate result.

## Stop conditions

Stop if the revised model is unavailable, holdout samples overlap task 008/005 evaluation samples, or the gate would require semantic human labels.
