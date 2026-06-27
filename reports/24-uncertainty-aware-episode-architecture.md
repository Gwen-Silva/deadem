# Experiment 24 uncertainty-aware episode architecture

## Summary

Task 014 tested whether the failed episode layer is primarily a point-classification-first architecture problem.

Gate result:

```text
no_architecture_resolves_tradeoff
```

No transition detection, second replay processing, or human review was promoted.

## Architectural problem

Task 006 showed that conservative point corrections generalized mechanically: point contradictions dropped from 50 to 0 and point instability dropped from 55 to 19 on holdout.

Task 013 showed the revised episode layer failed because short abstentions, base/deployment precedence, and truncation destroyed episode continuity. This task therefore tested whether lane occupancy should be inferred as a latent temporal state rather than as direct conversion from every point label.

## Observation versus latent state

The script separates:

- observation evidence: coordinates, nearest and second-nearest lane, margin, base/deployment evidence, speed, region, point model state, confidence, contradiction flags, and uncertainty;
- latent occupancy state: `lane_1`, `lane_2`, `lane_3`, `base`, `deployment`, `neutral_or_transit`, or `unknown`;
- episode evidence: support duration, contradictory duration, uncertain duration, support ratio, contradiction ratio, interruption count, entry and exit evidence, confidence, termination reason, and future-use eligibility.

The latent states are not semantic ground truth.

## Candidate definitions

Tested candidates:

- original experiment 23 episodes;
- failed conservative revision;
- trivial abstention baseline;
- hysteresis state machine;
- interval evidence accumulation;
- constrained dynamic programming;
- original experiment 23 episodes with evidence annotations.

The sequential candidates used bounded, interpretable parameters. No random search or broad optimization was used.

## Comparison results

Task 006 reference metrics:

- original episode contradictions: 12;
- failed revision episode contradictions: 75;
- failed revision lane coverage: 10.19%.

Diagnostic architecture metrics from this task:

| Candidate | Episode contradictions | Episodes | Coverage seconds | Fragmentation |
| --- | ---: | ---: | ---: | ---: |
| original experiment 23 | 14 | 359 | 2540 | 323 |
| failed conservative revision | 80 | 71 | 602 | 59 |
| trivial abstention | 90 | 0 | 0 | 0 |
| hysteresis state machine | 89 | 10 | 88 | 4 |
| interval evidence accumulation | 89 | 37 | 235 | 18 |
| constrained dynamic programming | 86 | 82 | 567 | 57 |
| annotated original episodes | 82 | 44 | 280 | 23 |

No candidate improved the failed revision enough while also preserving useful coverage and continuity.

## Coverage and abstention trade-off

Sequential candidates preserved point safety by retaining abstention, but this caused too little support to reconstruct holdout episodes.

The dynamic-programming candidate recovered the most sequential coverage among reconstructed candidates, but still produced 86 diagnostic episode contradictions and did not provide a usable improvement over the failed revision.

The annotated-original approach avoided rebuilding boundaries, but filtering by independent evidence reduced coverage to 280 seconds and still produced 82 diagnostic contradictions.

## Contradiction and fragmentation trade-off

The original experiment 23 episodes still have the strongest continuity, but they do not preserve the point-level contradiction reduction and therefore cannot be treated as a repaired model.

The failed revision and sequential candidates preserve point gains, but they either collapse coverage or keep high episode contradiction counts.

## Sensitivity

Bounded sensitivity results:

- hysteresis: episode contradiction range 87-90, coverage range 34-168, unstable under perturbation;
- interval evidence accumulation: episode contradiction range 85-87, coverage range 210-240, stable but still poor;
- constrained dynamic programming: episode contradiction range 86-87, coverage range 357-710, stable but still poor.

Stability here does not imply correctness. It only shows that bounded parameter perturbations do not explain the failure.

## Rejected candidates

Hysteresis was rejected because it over-abstained and left almost all holdout episodes contradicted.

Interval evidence accumulation was rejected because windowing was stable but did not recover useful episode continuity.

Constrained dynamic programming was rejected because it recovered more coverage but still failed the episode contradiction trade-off.

Annotated original episodes were rejected as the preferred path because evidence-based filtering did not produce enough usable coverage.

## Diagnostic-set limitations

The audit, revision, holdout, regression diagnosis, and this architecture test all use evidence already inspected during model development. These results are diagnostic only and cannot validate semantic correctness or final generalization.

No fresh holdout was created.

## Conclusions allowed

- The current single-replay derived evidence is enough to reject the tested sequential architectures as immediate fixes.
- The point-level conservative corrections remain mechanically useful.
- The episode problem is not solved by simply adding short memory, windows, or deterministic sequence optimization on the current evidence.
- Broad human review is still not required as the immediate next step.

## Conclusions prohibited

- Do not claim semantic ground-truth validation.
- Do not detect rotations or lane transitions.
- Do not use these episodes for strategic or macro inference.
- Do not claim multi-replay generalization.

## Required next evidence

The current single-replay diagnostic evidence is exhausted for this architecture class.

No compatible second replay is confirmed in `samples/`.

A methodological decision is required before choosing between acquiring/processing a compatible second replay, designing a minimized semantic review, or redefining the lane-episode target.

## Validation

Commands run:

```bash
node experiments\24-prototype-uncertainty-aware-lane-episode-segmentation.js
node node_modules\eslint\bin\eslint.js -c eslint.common.config.js experiments\24-prototype-uncertainty-aware-lane-episode-segmentation.js
node -e "for (const f of ['output/24-sequential-observation-evidence.json','output/24-hysteresis-occupancy-episodes.json','output/24-windowed-evidence-occupancy-episodes.json','output/24-dynamic-programming-occupancy-episodes.json','output/24-annotated-original-occupancy-episodes.json','output/24-sequential-architecture-comparison.json','output/24-sequential-architecture-sensitivity.json','output/24-sequential-architecture-gate.json']) JSON.parse(require('node:fs').readFileSync(f,'utf8')); console.log('json parse ok');"
npm.cmd run check:outputs -- 24
```

The script also passed deterministic repeatability checks by hashing the eight generated outputs, rerunning the script, and confirming unchanged hashes.
