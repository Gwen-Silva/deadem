# Experiment 24 occupancy holdout validation

## Summary

Task 006 ran an autonomous non-circular holdout audit for the revised lane occupancy model.

Gate result:

```text
failed_on_holdout
```

The holdout used existing derived outputs only. No replay was reprocessed and no human semantic labels were used.

## Holdout design

The holdout excluded:

- all point seconds used by task 008 and task 005 candidate evaluation
- all episode windows overlapping the task 008/005 episode samples

Holdout sample counts:

- points: 180
- episodes: 90

The sample set preserved distributions across player, lane, match phase, state, and episode duration where available.

## Original versus revised

Original model on holdout:

- point contradictions: 50
- point instability: 55
- episode contradictions: 12

Revised model on holdout:

- point contradictions: 0
- point instability: 19
- episode contradictions: 75

Deltas:

- point contradictions: -50
- point instability: -36
- episode contradictions: +63

## Interpretation

The revision generalized to point-level contradiction and instability reduction, but it failed episode holdout validation.

The episode regression means the conservative revision cannot be approved for downstream use, transition detection, or semantic claims.

This result does not request broad human review. The failure is mechanical: revised episode continuity/abstention behavior conflicts with holdout episode evidence.

## Gate

```text
failed_on_holdout
```

No task was promoted after this gate. A new model-revision decision is required before further autonomous work.

## Validation

Commands run:

```bash
node node_modules\eslint\bin\eslint.js -c eslint.common.config.js experiments\24-validate-occupancy-holdout.js
node experiments/24-validate-occupancy-holdout.js
node -e "for (const f of ['output/24-holdout-sample-set.json','output/24-holdout-original-evidence-audit.json','output/24-holdout-revised-evidence-audit.json','output/24-holdout-comparison.json','output/24-holdout-validation-gate.json']) JSON.parse(require('node:fs').readFileSync(f, 'utf8'));"
npm.cmd run check:outputs -- 24
npm.cmd run validate:tasks
```

All holdout outputs parse and remain below 10 MiB.
