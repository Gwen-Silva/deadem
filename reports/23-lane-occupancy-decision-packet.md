# Experiment 23 lane occupancy decision packet

## Problem investigated

`Fact`: Experiment 23 calibrates the lane occupancy model produced by experiment 22.

`Fact`: The stated failure mode was low recall in experiment 22: narrow lane-axis distance, broad deployment exclusion, and low or zero interruption tolerance caused many lane-like samples to become `deployment_ambiguous`, `lane_approach`, or brief contacts.

`Confirmed decision`: The current model is not ready for lane-transition, rotation, combat, objective, or macro-event detection. This matches `DEC-005`, `docs/PROJECT_STATE.md`, and `output/23-occupancy-calibration-review.json`.

## Pipeline

`Fact`: `experiments/23-calibrate-lane-occupancy.js` reads derived outputs only. It does not read the raw replay and does not execute replay parsing.

`Fact`: The script builds three candidate models, classifies per-player/per-second movement rows, derives stable lane occupancy episodes and brief contacts, compares against experiment 22, creates a manual-review queue, and writes 10 `output/23-*` JSON files.

## Inputs

`Fact`: Direct inputs read by experiment 23:

- `output/09-canonical-player-timeline.json`
- `output/13-player-lane-enrichment.json`
- `output/16-lane-topology-6592.json`
- `output/16-lane-field-semantics.json`
- `output/17-spatial-region-model.json`
- `output/17-player-region-timeline.json`
- `output/22-lane-geometry-model.json`
- `output/22-player-lane-occupancy-timeline.json`
- `output/22-stable-lane-occupancy-episodes.json`
- `output/22-lane-occupancy-sensitivity.json`
- `output/22-lane-occupancy-validation.json`
- `output/18-player-movement-metrics.json`

`Observed result`: The review output records 2,927 timeline snapshots, 5 field-semantic entries, 3 geometry lanes, and 216 sensitivity configurations from experiment 22.

## Outputs

`Fact`: Experiment 23 writes:

- `output/23-occupancy-classification-audit.json`
- `output/23-lane-polyline-validation.json`
- `output/23-lane-envelope-models.json`
- `output/23-initial-lane-validation.json`
- `output/23-brief-contact-fragmentation.json`
- `output/23-occupancy-model-comparison.json`
- `output/23-calibrated-lane-occupancy.json`
- `output/23-calibrated-occupancy-episodes.json`
- `output/23-occupancy-manual-review.json`
- `output/23-occupancy-calibration-review.json`

`Observed result`: The validation scripts parsed all 10 JSON files and confirmed each is below 10 MiB.

## Calibration method

`Fact`: Classification uses valid/alive position, distance to nearest lane axis, separation margin from the second-nearest lane, normalized progress along the lane, lane envelope width, base/deployment distance, and minimum stable duration.

`Fact`: `assignedLaneRaw` and `deducedLaneRaw` are diagnostic/reference fields. The output explicitly records that assigned lane is not used as classifier input.

`Limitation`: The method uses existing geometry and derived fields from the same replay pipeline. It does not introduce independent ground truth.

## Candidate models

`Fact`: Three configurations were compared:

- `conservative`: `maxCoreDistance=300`, `maxOccupancyDistance=360`, `minMargin=75`, `deploymentRadius=620`, `baseCoreRadius=280`, `minStableSeconds=8`, `interruptionTolerance=1`, `envelopeMultiplier=1`.
- `balanced`: `maxCoreDistance=380`, `maxOccupancyDistance=520`, `minMargin=45`, `deploymentRadius=500`, `baseCoreRadius=240`, `minStableSeconds=5`, `interruptionTolerance=3`, `envelopeMultiplier=1.25`.
- `high_recall`: `maxCoreDistance=460`, `maxOccupancyDistance=680`, `minMargin=25`, `deploymentRadius=420`, `baseCoreRadius=220`, `minStableSeconds=3`, `interruptionTolerance=5`, `envelopeMultiplier=1.6`.

## Selection criteria

`Fact`: The code selects `balanced` directly when it has lane core coverage of at least 20%, more stable episodes than experiment 22, and estimated base false-positive risk below 25%.

`Fact`: If that direct rule fails, the fallback score favors initial assigned-lane agreement and occupancy coverage, and penalizes deployment coverage, base false-positive risk, potential lane changes, brief contacts, and `high_recall`.

`Observed result`: `balanced` met the direct rule and was selected.

`Limitation`: These criteria measure internal consistency and plausibility, not real classification accuracy.

## Quantitative results

`Observed result`: The calibrated timeline contains 35,124 rows, 12 players, and seconds 19 through 2,945, equivalent to 2,927 seconds per player.

`Observed result`: `balanced` row states:

- `lane_core_high`: 6,576 rows, 18.72%.
- `lane_core_medium`: 2,169 rows, 6.18%.
- `lane_occupiable`: 9,983 rows, 28.42%.
- `deployment_ambiguous`: 6,073 rows, 17.29%.
- `base_core`: 4,769 rows, 13.58%.
- `unknown`: 5,528 rows, 15.74%.
- `lane_approach`: 26 rows, 0.07%.

`Observed result`: Compared with experiment 22, `balanced` increased stable episodes from 12 to 359 and lane core rows from 3,263 to 8,745. Deployment rows dropped from 14,941 to 6,073.

`Observed result`: `balanced` produced 18,728 lane-classified rows, 53.32% lane occupancy coverage, 24.90% lane core coverage, 40.00% deduced-lane agreement, 22.23% initial assigned-lane agreement, and 201 potential lane changes.

`Observed result`: Stable episodes: 359 total, median duration 6s, p90 10s, maximum 33s, total stable duration 2,540s. Brief contacts: 11,415 total, median duration 1s, p90 2s, maximum 20s, total duration 16,188s.

`Observed result`: The selected model has 55 high-confidence stable episodes and 304 medium-confidence stable episodes.

`Limitation`: No score values are emitted for the direct-rule path because `balanced` is selected before the fallback scoring branch.

## Manual validation

`Fact`: `output/23-occupancy-manual-review.json` contains 52 cases for review.

`Fact`: Cases are generated by code from five buckets: 12 initial-phase player samples, 10 long brief contacts, 10 fragmented same-lane sequences, 10 deployment samples with middle-lane progress, and 10 deduced-lane conflicts.

`Limitation`: This is a manual-review queue, not completed manual validation. The file does not contain human labels such as correct, incorrect, or ambiguous.

`Limitation`: Counts of reviewed correct/incorrect/ambiguous samples are unavailable.

## Evidence supporting the selected model

`Observed result`: `balanced` improves lane occupancy recall while preserving explicit base and deployment exclusions better than `high_recall`.

`Observed result`: `high_recall` has higher coverage, but it reduces deployment coverage to 8.31% and produces 1,136 potential lane changes. The review explicitly avoids choosing it solely by coverage.

`Observed result`: `balanced` evaluates all 12 players in the initial validation windows.

`Provisional decision`: Use `balanced` as the current candidate generator for validation, not as ground truth.

## Incorrect cases

`Limitation`: No case is proven incorrect by completed manual review.

`Observed result`: The report identifies suspicious categories that could contain incorrect classifications: deduced-lane conflicts, deployment samples far from base progress, low-separability regions, and long brief contacts.

`Observed result`: `occupiable_not_core` is the largest balanced loss reason, with 9,983 rows.

## Ambiguous cases

`Observed result`: `deployment_ambiguous` remains 6,073 rows, or 17.29%.

`Observed result`: `unknown` remains 5,528 rows, or 15.74%, tied by code to invalid/dead position.

`Observed result`: Brief contacts are highly fragmented: 11,415 contacts with p50 1s and p90 2s.

`Limitation`: Lane polyline continuity is low for all three lanes, with possible branches recorded as lane_1 = 5, lane_2 = 10, lane_3 = 4.

## Missing evidence

- Ground-truth lane occupancy labels.
- Completed manual-review labels.
- Precision/recall by state (`lane_core_high`, `lane_core_medium`, `lane_occupiable`, deployment).
- Correct/incorrect/ambiguous counts for the 52 manual-review cases.
- Reproducibility on another replay.
- Explicit score values for the selected direct-rule branch.
- Evidence that `interruptionTolerance` actually merges short interruptions in `buildEpisodes`; emitted stable episodes record `toleratedInterruptions: 0`.

## Circularity risk

`Limitation`: The calibration uses geometry, region data, movement metrics, assigned/deduced lane references, and baseline outputs derived from the same match pipeline.

`Limitation`: The validation is mostly internal consistency. It can show the model is less narrow than experiment 22, but cannot prove lane-occupancy correctness.

`Limitation`: `classificationFunnel` is not a strict sequential funnel because `near_lane` is counted across all rows, producing a negative `lostFromPrevious` after `outside_deployment`.

## Overfitting risk

`Limitation`: The selected thresholds are calibrated on one match, `partida_001.dem` as the origin of the derived outputs.

`Limitation`: The model depends on replay/build-specific coordinates and the 6592 lane geometry. It has not been run against another compatible match.

## Generalization readiness

`Limitation`: The method is reproducible in code when the same upstream derived files exist, but generalization to another replay is untested.

`Provisional decision`: Do not spend processing on another replay until the current match has a small labeled validation set; otherwise failures on another replay would be hard to interpret.

## Current model status

### Ready for

`Provisional decision`: Generate stratified validation candidates from the `balanced` model.

`Provisional decision`: Use `lane_core_high` and `lane_core_medium` as higher-confidence candidate strata for manual validation.

### Not ready for

`Confirmed decision`: Do not use the model for transition detection, rotation detection, combat attribution, objective context, or macro interpretation.

`Limitation`: `readyToDetectTransitions` is `false`, initial assigned-lane agreement is only 22.23%, and no ground-truth validation exists.

## Experiment 24 options

### Option A: stratified manual validation

- Uncertainty reduced: whether each state corresponds to real lane occupancy.
- Expected benefit: converts internal consistency into estimated precision by state.
- Risk: manual review cost and possible reviewer subjectivity.
- Dependency: `output/23-calibrated-lane-occupancy.json`, `output/23-calibrated-occupancy-episodes.json`, `output/23-occupancy-manual-review.json`, and replay/Explorer evidence.
- Implementation cost: medium.
- Processing cost: low if it samples existing outputs only.
- Output produced: review dataset with labels and per-state precision estimates.
- Validation value: validates the existing model.

### Option B: threshold recalibration

- Uncertainty reduced: whether alternate thresholds improve internal metrics.
- Expected benefit: may reduce fragmentation or improve initial agreement.
- Risk: overfits internal metrics without knowing which classifications are correct.
- Dependency: same experiment 23 derived files.
- Implementation cost: low.
- Processing cost: low to medium.
- Output produced: another model comparison.
- Validation value: mostly adds another internal layer unless paired with labels.

### Option C: another replay

- Uncertainty reduced: cross-match generalization.
- Expected benefit: tests whether geometry and thresholds transfer.
- Risk: high setup cost and hard-to-interpret failures without current-match labels.
- Dependency: another compatible replay and prior pipeline outputs.
- Implementation cost: high.
- Processing cost: high.
- Output produced: second-match calibration/validation comparison.
- Validation value: validates generalization, but only after the state definitions are trusted.

### Option D: transition detection

- Uncertainty reduced: none about occupancy correctness; it would start a higher-level layer.
- Expected benefit: produces transition candidates.
- Risk: builds on unvalidated occupancy and may amplify false positives from 201 potential lane changes.
- Dependency: reliable stable occupancy episodes and fragmentation handling.
- Implementation cost: medium.
- Processing cost: low to medium.
- Output produced: transition episodes.
- Validation value: adds another layer before validating the current one.

### Option E

Audit evaluation instrumentation.

- Uncertainty reduced: whether metrics like `classificationFunnel` and `interruptionTolerance` reflect the intended behavior.
- Expected benefit: cleans up measurement risk before or during validation.
- Risk: does not directly validate gameplay correctness.
- Dependency: experiment 23 code and outputs.
- Implementation cost: low.
- Processing cost: low.
- Output produced: corrected audit/metric definitions or a measurement-risk note.
- Validation value: supports Option A, but should not replace it.

## Primary recommendation

`Provisional decision`: Experiment 24 should be Option A, stratified manual validation.

Reason: the next uncertainty is not another threshold choice; it is whether the selected model's states correspond to real lane occupancy. Validation should come before transition, combat, objective, or macro layers.

## Falsifiable hypothesis

`Hypothesis`: In the `balanced` model, `lane_core_high` and `lane_core_medium` have enough precision to serve as candidate stable-lane occupancy states after manual validation, while `lane_occupiable` and brief contacts contain too many false positives or fragments to drive transition detection without additional rules.

## Suggested success criteria

- Review at least 60 to 100 stratified samples.
- Include every player, every physical lane, deployment states, core confidence levels, brief contacts, long contacts, and suspected transition-adjacent cases.
- Report correct, incorrect, and ambiguous counts by state.
- Define whether `lane_occupiable` may be merged into stable occupancy or must remain context-only.
- Do not infer strategic intent from spatial presence.
- Keep `readyToDetectTransitions=false` unless lane-state precision is sufficient and brief-contact handling is resolved.

## Relevant files

- `tasks/active/001-evaluate-experiment-23-lane-occupancy.md`
- `experiments/22-build-lane-occupancy-model.js`
- `experiments/23-calibrate-lane-occupancy.js`
- `output/22-lane-occupancy-validation.json`
- `output/22-lane-occupancy-sensitivity.json`
- `output/22-stable-lane-occupancy-episodes.json`
- `output/23-occupancy-calibration-review.json`
- `output/23-occupancy-model-comparison.json`
- `output/23-calibrated-lane-occupancy.json`
- `output/23-calibrated-occupancy-episodes.json`
- `output/23-occupancy-manual-review.json`
- `output/23-brief-contact-fragmentation.json`
- `output/23-occupancy-classification-audit.json`
