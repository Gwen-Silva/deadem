# Experiment 24 autonomous lane occupancy evidence audit

## Facts

- The audit used existing derived outputs only.
- No replay was reprocessed.
- The audit evaluated 120 point samples and 72 episode samples from experiment 24.
- The autonomous gate result is `autonomous_evidence_requires_model_revision`.
- This is not human semantic ground truth.

## Internal consistency

Experiment 23 source rows and experiment 23 episodes were treated as the prediction under audit, not as proof.

Experiment 23 episode containment was useful for point/episode consistency, but it was recorded as internal or semi-independent evidence because it is derived from the same selected occupancy model.

## Independent evidence

The audit used distinct derived evidence where available:

- experiment 18 movement metrics: coordinates, speed, nearest lane, second-nearest lane, lane-distance margin, base distance
- experiment 17 region timeline and spatial model: region context and lane-axis geometry
- experiment 22 occupancy timeline and episodes: earlier independent parameterization for cross-model comparison

These signals can support or contradict the model, but they are not semantic ground truth.

## Evidence counts

Point evidence statuses:

- `automatically_contradicted`: 35
- `automatically_supported`: 6
- `internally_consistent_only`: 29
- `unstable_under_perturbation`: 50

Episode evidence statuses:

- `automatically_contradicted`: 7
- `internally_consistent_only`: 65

## Contradictions

The strongest contradiction was `p24_point_070`.

Model prediction:

- state: `lane_core_medium`
- physical lane: `lane_2`
- phase: `middle`

Contradictory conditions:

- `base_geometry_strongly_contradicts_lane_occupancy`
- `classification_changes_under_small_threshold_perturbations`
- `high_speed_or_possible_discontinuity_near_sample`

Measurements included speed `1014.79`, experiment 18 region `base_team_3`, raw region `between_lanes`, and six perturbation changes from `lane_core_medium` to `lane_core_high`.

This is a mechanical evidence contradiction, not a semantic label.

## Stability evidence

Point sensitivity:

- 76 of 120 point samples changed under bounded perturbation.
- changed percent: 63.33%.
- lane_1 changed 100%.
- lane_2 changed 92.31%.
- lane_3 changed 75%.
- no-lane states changed 10.53%.

Episode sensitivity:

- 0 of 72 sampled episode classifications changed under the bounded episode-type perturbation.

Stability is evidence of robustness. It is not correctness. Instability is evidence that a classification is not ready for higher-level use.

## Cross-model agreement

Point samples:

- agreement: 76
- selected-model-only classification: 41
- majority unknown: 3

Episode samples:

- agreement: 37
- disagreement: 34
- majority mixed: 1

Cross-model agreement was not treated as ground truth because experiment 22 and experiment 23 share upstream geometry assumptions.

## Unresolved semantics

The audit produced `output/24-minimal-human-review-queue.json` with 24 decision-relevant cases. Because the autonomous gate is `autonomous_evidence_requires_model_revision`, this queue is not the immediate next gate; it is preserved for later use if mechanical revision cannot resolve the disputed cases.

## Conclusions allowed without human ground truth

- The current point classifications are highly sensitive to small threshold perturbations.
- There are enough conservative measured contradictions to justify a model-revision task.
- Broad human labeling is not the immediate mandatory next step.
- Transition detection remains prohibited.

## Conclusions still prohibited

- Do not claim semantic correctness of lane occupancy.
- Do not claim human-ground-truth validation.
- Do not infer strategic intent.
- Do not judge rotation quality.
- Do not promote transition detection from internal consistency or cross-model agreement.

## Minimal human work required

Immediate human review required: 0 samples.

Reason: the autonomous gate found mechanical contradiction and instability sufficient to justify model revision before semantic escalation.

If model revision cannot resolve the disputes, use `output/24-minimal-human-review-queue.json` as the minimized review queue rather than requesting broad labels.

## Outputs

- `output/24-autonomous-point-evidence-audit.json`
- `output/24-autonomous-episode-evidence-audit.json`
- `output/24-occupancy-sensitivity-analysis.json`
- `output/24-cross-model-agreement.json`
- `output/24-independent-evidence-summary.json`
- `output/24-minimal-human-review-queue.json`
- `output/24-autonomous-validation-gate.json`

## Validation

Commands run:

```bash
node node_modules\eslint\bin\eslint.js -c eslint.common.config.js experiments\24-autonomous-independent-lane-occupancy-audit.js
node experiments/24-autonomous-independent-lane-occupancy-audit.js
node -e "for (const f of ['output/24-autonomous-point-evidence-audit.json','output/24-autonomous-episode-evidence-audit.json','output/24-occupancy-sensitivity-analysis.json','output/24-cross-model-agreement.json','output/24-independent-evidence-summary.json','output/24-minimal-human-review-queue.json','output/24-autonomous-validation-gate.json']) JSON.parse(require('node:fs').readFileSync(f, 'utf8'));"
npm.cmd run check:outputs -- 24
npm.cmd run validate:tasks
```

All generated outputs parsed and remained below 10 MiB.
